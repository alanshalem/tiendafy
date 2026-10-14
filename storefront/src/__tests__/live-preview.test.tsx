/**
 * La tienda dentro del editor de diseño (vista previa en vivo): recibe el
 * borrador del tema por postMessage SOLO desde el origin del panel, enfoca la
 * sección que se está editando, abre el carrito cuando se edita el carrito y
 * trae al vuelo un producto destacado recién elegido. Fuera del editor, la
 * misma vista pone el CSS propio (saneado) y el botón de WhatsApp; el favicon
 * lo pone el servidor (metadata del layout) y acá solo cambia en vivo.
 */
import { act, screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { EDITOR_MSG, sectionProductPlan } from '@tiendafy/types';
import { planKey } from '../lib/section-products';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorefrontView } from '../components/store/StorefrontView';
import { ADMIN_ORIGIN } from '../components/store/preview';
import { mergeTheme, type ThemeConfig } from '../lib/theme';
import { toStoreProducts, type ProductDto } from '../lib/catalog';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';

const theme = mergeTheme(fixture<ThemeConfig>('/api/v1/theme'));
const dto = fixture<ProductDto>('/api/v1/products/by-slug/x');
const products = toStoreProducts([dto]);

let api: MockApi;
let crashes: () => unknown[][];

const SECTION = '/api/v1/products/section';
/** Los pedidos de productos de secciones que hizo la vista, como query params. */
const sectionCalls = () =>
  api.calls
    .filter((c) => c.path.startsWith(`${SECTION}?`))
    .map((c) => new URL(c.path, 'http://x').searchParams);
const featuredWith = (productIds: string[], title = 'Elegidos') => ({
  ...theme,
  sections: [{ id: 'f', type: 'featured', visible: true, data: { title, productIds } }],
});

function view(props: Partial<Parameters<typeof StorefrontView>[0]> = {}) {
  return render(
    <StorefrontView
      tenantId={fixtureTenantId}
      tenantName="Tienda Seed"
      theme={theme}
      products={products}
      {...props}
    />,
  );
}

async function fromEditor(data: object, origin = ADMIN_ORIGIN) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  });
  await settle(2);
}

beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
  document.querySelector('link[rel="icon"]')?.remove();
});

describe('vista previa del editor', () => {
  it('el favicon que sube el comercio se ve en vivo', async () => {
    view({ live: true, theme: { ...theme, favicon: 'https://cdn.example.com/favicon.png' } });
    await settle(2);
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href).toBe(
      'https://cdn.example.com/favicon.png',
    );
  });

  it('aplica el borrador que manda el panel, y solo el del panel', async () => {
    view({ live: true });
    await settle(2);
    const institutional = (title: string) => ({
      ...theme,
      sections: [{ id: 'nuevo', type: 'institutional', visible: true, data: { title, description: '' } }],
    });

    await fromEditor(
      { type: EDITOR_MSG.theme, theme: institutional('Llega de otro sitio') },
      'https://malicioso.example',
    );
    expect(screen.queryByText('Llega de otro sitio')).not.toBeInTheDocument();

    await fromEditor({ type: EDITOR_MSG.theme, theme: institutional('Borrador nuevo') });
    expect(screen.getByText('Borrador nuevo')).toBeInTheDocument();

    await fromEditor({ type: EDITOR_MSG.theme }); // sin tema: no cambia nada
    expect(screen.getByText('Borrador nuevo')).toBeInTheDocument();
  });

  it('enfoca la sección que se está editando', async () => {
    view({ live: true });
    await settle(2);
    vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true });
    try {
      const header = document.querySelector<HTMLElement>('[data-tf-focus="header"]')!;
      await fromEditor({ type: EDITOR_MSG.focusSection, target: 'header' });
      expect(header).toHaveClass('tf-focus-flash');
      act(() => vi.advanceTimersByTime(1500));
      expect(header).not.toHaveClass('tf-focus-flash');

      const section = theme.sections.find((s) => s.visible)!;
      await fromEditor({ type: EDITOR_MSG.focusSection, sectionId: section.id });
      expect(document.querySelector(`[data-tf-focus="section:${section.id}"]`)).toHaveClass('tf-focus-flash');

      await fromEditor({ type: EDITOR_MSG.focusSection, target: 'no-existe' }); // nada que enfocar
    } finally {
      vi.useRealTimers();
    }
  });

  it('abre y cierra el carrito cuando se edita el carrito', async () => {
    view({ live: true });
    await settle(2);
    await fromEditor({ type: EDITOR_MSG.previewCart, open: true });
    expect(screen.getByRole('dialog', { name: /carrito/i })).toBeInTheDocument();
    await fromEditor({ type: EDITOR_MSG.previewCart, open: false });
    expect(screen.queryByRole('dialog', { name: /carrito/i })).not.toBeInTheDocument();
    await fromEditor({ type: EDITOR_MSG.previewCart, open: true }, 'https://malicioso.example');
    expect(screen.queryByRole('dialog', { name: /carrito/i })).not.toBeInTheDocument();
  });

  it('el carrito vacío se muestra con un producto de muestra (y las opciones se ven)', async () => {
    view({
      live: true,
      theme: {
        ...theme,
        cart: { ...theme.cart, notice: 'Envíos los martes', checkoutButtonText: 'Pagar ya' },
      },
    });
    await settle(2);
    await fromEditor({ type: EDITOR_MSG.previewCart, open: true });
    const drawer = screen.getByRole('dialog', { name: /carrito/i });
    expect(drawer).toHaveTextContent(/producto de muestra/);
    expect(drawer).toHaveTextContent(products[0]!.name);
    expect(drawer).toHaveTextContent('Envíos los martes');
    expect(screen.getByRole('button', { name: 'Pagar ya' })).toBeInTheDocument();
    // La muestra no toca el carrito de verdad.
    expect(localStorage.getItem(`tiendafy.cart.${fixtureTenantId}`)).toBeNull();
  });

  it('muestra la página "en construcción" mientras su panel está abierto', async () => {
    view({ live: true, theme: { ...theme, comingSoon: { ...theme.comingSoon, title: 'Ya casi abrimos' } } });
    await settle(2);
    expect(screen.queryByText('Ya casi abrimos')).not.toBeInTheDocument();
    await fromEditor({ type: EDITOR_MSG.previewComingSoon, show: true });
    expect(screen.getByRole('heading', { name: 'Ya casi abrimos' })).toBeInTheDocument();
    expect(screen.getByText(/tus visitantes siguen viendo la tienda/)).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    await fromEditor({ type: EDITOR_MSG.previewComingSoon, show: false });
    expect(screen.queryByText('Ya casi abrimos')).not.toBeInTheDocument();
    // De otro origen, nada.
    await fromEditor({ type: EDITOR_MSG.previewComingSoon, show: true }, 'https://malicioso.example');
    expect(screen.queryByText('Ya casi abrimos')).not.toBeInTheDocument();
  });

  it('el botón de WhatsApp se ve sin número (para ubicarlo), a la izquierda y con texto', async () => {
    view({
      live: true,
      theme: {
        ...theme,
        whatsappButton: {
          ...theme.whatsappButton,
          enabled: true,
          phone: '',
          position: 'left',
          label: '¿Te ayudamos?',
        },
      },
    });
    await settle(2);
    const fab = document.querySelector('[data-tf-focus="whatsapp"]')!;
    expect(fab).toHaveClass('left-5');
    expect(screen.getByRole('link', { name: '¿Te ayudamos? (WhatsApp)' })).toHaveTextContent('¿Te ayudamos?');
  });

  it('trae al vuelo un destacado que no estaba en la tienda', async () => {
    const otherId = '99999999-9999-9999-9999-999999999999';
    api.on('GET', SECTION, { items: [{ ...dto, id: otherId, name: 'Recién destacado' }] });
    view({ live: true, theme: { ...theme, sections: [] } });
    await settle(2);
    await fromEditor({ type: EDITOR_MSG.theme, theme: featuredWith([otherId]) });
    const asked = sectionCalls();
    expect(asked).toHaveLength(1);
    expect(asked[0]!.get('kind')).toBe('manual');
    expect(asked[0]!.get('ids')).toBe(otherId);
    expect(screen.getAllByText('Recién destacado').length).toBeGreaterThan(0);
  });

  it('un elegido que ya no existe no se vuelve a pedir con cada cambio del tema', async () => {
    // Antes: el borrado nunca llegaba, así que cada tecla en el editor lo volvía a pedir.
    const gone = '88888888-8888-8888-8888-888888888888';
    api.on('GET', SECTION, { items: [] });
    view({ live: true, theme: { ...theme, sections: [] } });
    await settle(2);
    await fromEditor({ type: EDITOR_MSG.theme, theme: featuredWith([gone], 'Elegidos') });
    await fromEditor({ type: EDITOR_MSG.theme, theme: featuredWith([gone], 'Elegidos!') });
    await fromEditor({ type: EDITOR_MSG.theme, theme: { ...featuredWith([gone]), favicon: 'x.png' } });
    expect(sectionCalls()).toHaveLength(1);
    // Sin productos para mostrar, la sección no aparece (antes caía a "los primeros del catálogo").
    expect(screen.queryByText('Elegidos!')).not.toBeInTheDocument();

    // Cambiar lo elegido sí pide, una vez y todo junto.
    const other = '77777777-7777-7777-7777-777777777777';
    await fromEditor({ type: EDITOR_MSG.theme, theme: featuredWith([gone, other]) });
    await fromEditor({ type: EDITOR_MSG.theme, theme: featuredWith([gone, other], 'Otro título') });
    expect(sectionCalls()).toHaveLength(2);
    expect(sectionCalls()[1]!.get('ids')).toBe(`${gone},${other}`);
  });

  it('lo que el servidor ya resolvió no se vuelve a pedir; un origen nuevo, sí', async () => {
    const sections = [{ id: 'n', type: 'new-products' as const, visible: true, data: { title: 'Lo nuevo' } }];
    const withNew = { ...theme, sections };
    const key = planKey(sectionProductPlan(sections[0]!)!);
    api.on('GET', SECTION, { items: [{ ...dto, id: 'en-oferta', name: 'En oferta ya' }] });
    view({
      live: true,
      theme: withNew,
      sectionProducts: { [key]: toStoreProducts([{ ...dto, id: 'nuevo-1', name: 'Lo más nuevo' }]) },
    });
    await settle(2);
    expect(screen.getAllByText('Lo más nuevo').length).toBeGreaterThan(0);
    expect(sectionCalls()).toHaveLength(0);

    await fromEditor({
      type: EDITOR_MSG.theme,
      theme: {
        ...withNew,
        sections: [...sections, { id: 's', type: 'sale-products', visible: true, data: {} }],
      },
    });
    expect(sectionCalls().map((q) => q.get('kind'))).toEqual(['on-sale']);
    expect(screen.getAllByText('En oferta ya').length).toBeGreaterThan(0);
  });

  it('avisa al panel que está lista cuando corre dentro del iframe', async () => {
    const parent = { postMessage: vi.fn() };
    const original = Object.getOwnPropertyDescriptor(window, 'parent')!;
    Object.defineProperty(window, 'parent', { value: parent, configurable: true });
    try {
      view({ live: true });
      await settle(1);
      expect(parent.postMessage).toHaveBeenCalledWith({ type: EDITOR_MSG.previewReady }, ADMIN_ORIGIN);
    } finally {
      Object.defineProperty(window, 'parent', original);
    }
  });
});

describe('la tienda publicada', () => {
  it('CSS propio saneado y botón de WhatsApp (el favicon ya vino del servidor)', async () => {
    const { unmount } = view({
      theme: {
        ...theme,
        favicon: 'https://cdn.example.com/favicon.png',
        customCss: '.x { color: red } @import url(https://malicioso.example/a.css);',
        whatsappButton: {
          ...theme.whatsappButton,
          enabled: true,
          phone: '+54 9 11 5555-4444',
          showPreview: false,
        },
      },
    });
    await settle(2);
    expect(document.querySelector('link[rel="icon"]')).toBeNull();
    // El <style> de la tienda (el setup de los tests agrega otro en el <head>).
    const css = document.querySelector('body style')!.innerHTML;
    expect(css).toContain('color: red');
    expect(css).not.toContain('@import');
    expect(document.querySelector('a[href^="https://wa.me/5491155554444"]')).not.toBeNull();
    // A la derecha, como siempre, si el tema no dice otra cosa.
    expect(document.querySelector('[data-tf-focus="whatsapp"]')).toHaveClass('right-5');
    unmount();
  });

  it('sin número, en la tienda publicada el botón de WhatsApp no aparece', async () => {
    view({ theme: { ...theme, whatsappButton: { ...theme.whatsappButton, enabled: true, phone: '' } } });
    await settle(2);
    expect(document.querySelector('[data-tf-focus="whatsapp"]')).toBeNull();
  });
});
