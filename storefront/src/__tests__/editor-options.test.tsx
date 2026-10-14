/**
 * Que cada opción de "Editar diseño" se note en la tienda y en la vista
 * previa (lo encontrado probándolas una por una en el navegador): el texto
 * del carrusel que no se cortaba en celular, los avisos de "subí una foto"
 * que tapaba el título, el pop-up que no se podía cerrar en el editor, el
 * collage a medio elegir, las tiendas oscuras y los carruseles con flechas.
 */
import type { CarouselSlide, PromoPopupData, SectionType, ThemeSection } from '@tiendafy/types';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditableRegion } from '../components/store/EditableRegion';
import { slideBox } from '../components/store/ImageCarousel';
import { PreviewContext } from '../components/store/preview';
import type { StoreProduct } from '../components/store/ProductCard';
import { DarkPageContext } from '../components/store/section-context';
import { SectionRenderer } from '../components/store/sections';
import { popupWhen } from '../components/store/sections/promo-popup';
import { SectionProductsContext } from '../components/store/SectionProductsContext';
import { toStoreProducts, type ProductDto } from '../lib/catalog';
import { defaultTheme } from '../lib/theme';
import { fixture, mockApi } from '../test/api';
import { renderInStore as render } from '../test/store';

const img = (n: number) => `https://cdn.example.com/img-${n}.jpg`;
const dto = fixture<ProductDto>('/api/v1/products/by-slug/x');
const products = toStoreProducts(
  Array.from({ length: 4 }, (_, i) => ({ ...dto, id: `p-${i}`, slug: `prod-${i}`, name: `Producto ${i}` })),
);

const section = (type: SectionType, data: Record<string, unknown>, extra: Partial<ThemeSection> = {}) =>
  ({ id: `s-${type}`, type, visible: true, data, ...extra }) as ThemeSection;

function ui(
  s: ThemeSection,
  opts: { preview?: boolean; dark?: boolean; resolved?: Record<string, StoreProduct[]> } = {},
): ReactNode {
  return (
    <PreviewContext.Provider value={!!opts.preview}>
      <DarkPageContext.Provider value={!!opts.dark}>
        <SectionProductsContext.Provider value={opts.resolved ?? {}}>
          <SectionRenderer
            section={s}
            products={products}
            storeName="Tienda"
            productList={defaultTheme.productList}
          />
        </SectionProductsContext.Provider>
      </DarkPageContext.Provider>
    </PreviewContext.Provider>
  );
}

beforeEach(() => {
  mockApi();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const slide = (extra: Partial<CarouselSlide> = {}): CarouselSlide => ({
  image: img(1),
  mobileImage: '',
  alt: '',
  link: '',
  newTab: false,
  title: '',
  subtitle: '',
  buttonText: '',
  textPosition: 'center',
  overlay: 'none',
  ...extra,
});

describe('carrusel', () => {
  it('"según la foto" en celular deja lugar al texto: sin foto propia, un alto mínimo', () => {
    const data = { height: 'adapt', heightMobile: 'auto' } as const;
    // Sin texto, la proporción de la foto tal cual.
    expect(slideBox(data, slide())).toContain('aspect-[79/30]');
    expect(slideBox(data, slide())).not.toContain('min-h-');
    // Con título, botón y subtítulo, 150 px de alto cortaban el título.
    expect(slideBox(data, slide({ title: 'Nueva temporada' }))).toContain('min-h-[260px] md:min-h-0');
    // Con foto de celular (4:5) ya hay lugar.
    expect(slideBox(data, slide({ title: 'T', mobileImage: img(2) }))).toBe(
      'aspect-[4/5] md:h-auto md:aspect-[79/30]',
    );
  });

  it('los puntos se tocan en 40 px de alto', () => {
    render(ui(section('carousel', { slides: [slide(), slide({ image: img(2) })], autoplay: false })));
    const dot = screen.getByRole('button', { name: 'Ir a la diapositiva 2' });
    expect(dot.className).toMatch(/\bh-10\b/);
  });

  it('en el editor, una diapositiva sin foto avisa del lado contrario al texto', () => {
    render(
      ui(section('carousel', { slides: [slide({ image: '', title: 'Hola', textPosition: 'top-left' })] }), {
        preview: true,
      }),
    );
    const notice = screen.getByText('Subí la foto de esta diapositiva');
    // Chiquito y abajo (el texto va arriba), no en el medio debajo del título.
    expect(notice.closest('div')).toHaveClass('items-end');
  });
});

describe('imagen y texto', () => {
  const base = { title: 'Nuestra historia', description: 'Texto', image: img(1) };

  it('texto claro sobre una tienda oscura respeta el fondo elegido (antes, siempre un recuadro oscuro)', () => {
    const s = section('image-text', { ...base, textColor: 'light', textBackground: 'accent' });
    const { unmount } = render(ui(s, { dark: true }));
    const panel = screen.getByRole('heading', { name: 'Nuestra historia' }).parentElement!;
    expect(panel.className).toContain('bg-primary/[0.08]');
    expect(panel.className).not.toContain('bg-[rgb(17_24_39)]');
    unmount();
    // Sobre una tienda clara sigue el recuadro oscuro: el texto blanco no se leería.
    render(ui(s));
    expect(screen.getByRole('heading', { name: 'Nuestra historia' }).parentElement!.className).toContain(
      'bg-[rgb(17_24_39)]',
    );
  });

  it('en el editor, sin foto se ve su lugar (y las opciones de lado se notan); en la tienda no', () => {
    const s = section('image-text', { ...base, image: '', ratio: '1x1', imagePosition: 'right' });
    const { unmount } = render(ui(s, { preview: true }));
    const slot = screen.getByText('Subí una imagen').closest('.aspect-square');
    expect(slot).not.toBeNull();
    expect(slot!.parentElement).toHaveClass('md:order-2');
    unmount();
    render(ui(s));
    expect(screen.queryByText('Subí una imagen')).not.toBeInTheDocument();
  });
});

describe('collage', () => {
  const block = (extra: Record<string, unknown>) => ({
    kind: 'image',
    image: '',
    title: '',
    link: '',
    productId: '',
    categoryId: '',
    ...extra,
  });

  it('en el editor, un producto o una categoría sin elegir se ve con lo que falta', () => {
    render(
      ui(
        section('collage', {
          blocks: [
            block({ kind: 'product' }),
            block({ kind: 'category' }),
            block({ image: img(1), title: 'Ofertas' }),
          ],
        }),
        { preview: true },
      ),
    );
    expect(screen.getByText('Elegí un producto')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('en la tienda, si queda uno solo ocupa el ancho entero (antes, media fila vacía)', () => {
    render(
      ui(
        section('collage', { blocks: [block({ kind: 'product' }), block({ image: img(1), title: 'Uno' })] }),
      ),
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveClass('md:col-span-2');
  });
});

describe('íconos con texto', () => {
  const items = [1, 2, 3].map((n) => ({
    icon: 'shipping',
    image: '',
    title: `Item ${n}`,
    text: 'T',
    link: '',
  }));

  it('el título va centrado como las columnas, y a la izquierda si se eligió', () => {
    const { unmount } = render(ui(section('icon-columns', { title: 'Beneficios', items })));
    expect(screen.getByRole('heading', { name: 'Beneficios' })).toHaveClass('text-center');
    unmount();
    render(ui(section('icon-columns', { title: 'Beneficios', items }, { style: { align: 'left' } })));
    expect(screen.getByRole('heading', { name: 'Beneficios' })).not.toHaveClass('text-center');
  });

  it('deslizando, cada columna va en una tarjeta (si no, la siguiente asomaba vacía)', () => {
    render(ui(section('icon-columns', { items, mobile: 'swipe' })));
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('bg-fg/[0.04]');
  });
});

describe('carruseles con flechas en la computadora', () => {
  it('testimonios: anterior y siguiente', () => {
    const items = [1, 2, 3, 4].map((n) => ({
      quote: `Opinión ${n}`,
      name: `N${n}`,
      detail: '',
      photo: '',
      rating: 'none',
    }));
    render(ui(section('testimonials', { items, layout: 'carousel' })));
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  });

  it('en grilla no hay flechas', () => {
    const items = [1, 2].map((n) => ({
      quote: `Opinión ${n}`,
      name: `N${n}`,
      detail: '',
      photo: '',
      rating: 'none',
    }));
    render(ui(section('testimonials', { items, layout: 'grid' })));
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  });
});

describe('ofertas con cronómetro', () => {
  it('sin respuesta de la API, muestra lo del origen elegido (no siempre "lo que está en oferta")', () => {
    const end = new Date(Date.now() + 86_400_000).toISOString();
    render(
      ui(section('countdown-offer', { title: 'Promo', endsAt: end, source: { kind: 'newest' }, limit: 3 })),
    );
    // Ninguno de los productos tiene precio tachado: antes no se veía ninguno.
    expect(screen.getAllByRole('link', { name: /Producto \d/ }).length).toBeGreaterThan(0);
  });
});

describe('video', () => {
  it('la miniatura de YouTube en un recuadro no horizontal se agranda para sacar las franjas negras', () => {
    const { container, unmount } = render(
      ui(
        section('video', {
          source: 'link',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          ratio: '9:16',
        }),
      ),
    );
    expect(container.querySelector('.-inset-y-\\[16\\.7\\%\\]')).not.toBeNull();
    unmount();
    const r = render(
      ui(
        section('video', {
          source: 'link',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          ratio: '16:9',
        }),
      ),
    );
    expect(r.container.querySelector('.-inset-y-\\[16\\.7\\%\\]')).toBeNull();
  });
});

describe('pop-up en el editor', () => {
  const data = (extra: Partial<PromoPopupData> = {}) =>
    ({ trigger: 'delay', delaySeconds: 5, frequency: 'days', frequencyDays: 7, ...extra }) as PromoPopupData;

  it('dice cuándo y cada cuánto aparece (en la vista previa se abre a mano)', () => {
    expect(popupWhen(data())).toBe('a los 5 segundos de entrar, y otra vez a los 7 días');
    expect(popupWhen(data({ trigger: 'exit', frequency: 'once' }))).toBe(
      'cuando el mouse se va de la página (solo en computadoras), una sola vez por persona',
    );
    expect(popupWhen(data({ trigger: 'both', delaySeconds: 1, frequency: 'session' }))).toBe(
      'a los 1 segundo de entrar o al querer irse, lo que pase primero, una vez por visita',
    );
  });

  it('"Ver el pop-up" lo abre y la X lo cierra, aunque la sección abra su panel al tocarla', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const user = userEvent.setup({ delay: null });
    const s = section('promo-popup', { ...data(), title: 'Promo', text: 'Hola' });
    render(
      <PreviewContext.Provider value>
        <EditableRegion target="section" id={s.id}>
          {ui(s, { preview: true })}
        </EditableRegion>
      </PreviewContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ver el pop-up' }));
    const dialog = document.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(dialog).not.toHaveAttribute('open');
    // Ninguno de los dos clics abrió el panel de la sección.
    expect(post).not.toHaveBeenCalled();
    // Un clic en el resto de la sección sí lo abre (como siempre).
    fireEvent.click(screen.getByText(/En la tienda no ocupa lugar/));
    expect(post).toHaveBeenCalled();
  });
});
