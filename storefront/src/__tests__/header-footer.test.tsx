/**
 * El encabezado y el pie según lo que el comercio eligió en el editor: las
 * cuatro disposiciones, la barra de anuncio (fija o en marquesina), el menú
 * con su orden y visibilidad, la búsqueda, el panel del celular, el
 * transparente sobre la portada y — dentro del editor — los botones para
 * editar cada parte. El pie con sus redes, páginas y newsletter.
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EDITOR_MSG } from '@tiendafy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../components/store/StoreHeader';
import { Footer } from '../components/store/StoreFooter';
import { ADMIN_ORIGIN, PreviewContext } from '../components/store/preview';
import { mergeTheme, type ThemeConfig } from '../lib/theme';
import { fixture, fixtureTenantId, mockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const base = mergeTheme(fixture<ThemeConfig>('/api/v1/theme'));
const page = fixture<{ items: { id: string; title: string }[] }>('/api/v1/pages/published').items[0];

function theme(header: Partial<ThemeConfig['header']> = {}, extra: Partial<ThemeConfig> = {}): ThemeConfig {
  return { ...base, ...extra, header: { ...base.header, ...header } };
}

async function show(t: ThemeConfig, { preview = false, path = '/' } = {}) {
  nav.at(path);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  const view = renderInStore(
    <PreviewContext.Provider value={preview}>
      <Header theme={t} tenantName="Tienda Seed" />
      <Footer theme={t} tenantName="Tienda Seed" />
    </PreviewContext.Provider>,
  );
  await settle(2);
  return { user, ...view };
}

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

/**
 * jsdom no hace layout (todo mide 0): el menú creería que no entra nada. Se
 * simula un encabezado ancho con ítems de 60 px; `width` lo achica.
 */
function layout(width = 2000) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(60);
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);
}

describe('encabezado', () => {
  beforeEach(() => layout());

  it.each(['classic', 'logo-center', 'menu-left', 'menu-right'] as const)(
    'disposición %s: logo, menú e íconos',
    async (layout) => {
      await show(theme({ layout, showSearch: true, cartStyle: 'text', logoSize: 'lg' }));
      const header = within(screen.getByRole('banner'));
      expect(header.getAllByText('Tienda Seed').length).toBeGreaterThan(0);
      expect(header.getAllByRole('link', { name: 'Productos' }).length).toBeGreaterThan(0);
      expect(header.getAllByRole('button', { name: 'Abrir carrito' })[0]).toHaveTextContent('Carrito');
      expect(header.getAllByRole('textbox', { name: 'Buscar' }).length).toBeGreaterThan(0);
    },
  );

  it('el menú respeta el orden y lo oculto del editor, y suma las páginas publicadas', async () => {
    await show(
      theme({
        menu: [
          { id: 'contact', visible: true },
          { id: 'home', visible: false },
        ],
      }),
    );
    const links = within(screen.getByRole('banner'))
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(links).not.toContain('Inicio');
    expect(links.indexOf('Contacto')).toBeLessThan(links.indexOf('Productos'));
    if (page) expect(links).toContain(page.title);
  });

  it('lo que no entra en una línea va a "Más", sin esconder nada', async () => {
    layout(200); // entran dos ítems y el "Más"
    const { user } = await show(theme());
    const header = within(screen.getByRole('banner'));
    const more = () => header.getByRole('button', { name: /Más/ });

    await user.click(more());
    expect(more()).toHaveAttribute('aria-expanded', 'true');
    await user.click(header.getAllByRole('link', { name: 'Contacto' }).at(-1)!);
    expect(more()).toHaveAttribute('aria-expanded', 'false');

    // Con el teclado alterna.
    act(() => more().focus());
    await user.keyboard('{Enter}');
    expect(more()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Enter}');
    expect(more()).toHaveAttribute('aria-expanded', 'false');
  });

  it('regresión: el gesto que abre "Más" (hover + clic, o un tap) no lo vuelve a cerrar', async () => {
    layout(200);
    await show(theme());
    const more = within(screen.getByRole('banner')).getByRole('button', { name: /Más/ });
    // Lo que manda un tap en Android: mouseenter y click, en el mismo gesto.
    fireEvent.mouseEnter(more);
    fireEvent.click(more, { detail: 1 });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseLeave(more.parentElement!);
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('regresión: el desplegable de Categorías tampoco se cierra con el gesto que lo abre', async () => {
    const category = fixture<{ items: { name: string }[] }>('/api/v1/categories').items[0]!.name;
    const { user } = await show(theme());
    const trigger = within(screen.getByRole('banner')).getByRole('button', { name: /Categorías/ });
    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger, { detail: 1 });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getAllByRole('link', { name: category })[0]!);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('logo como imagen en sus tres tamaños', async () => {
    for (const logoSize of ['sm', 'md', 'lg'] as const) {
      const { unmount } = await show(theme({ logoSize }, { logo: 'https://cdn.example.com/logo.png' }));
      expect(screen.getAllByRole('img', { name: 'Tienda Seed' }).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('la búsqueda lleva al listado con la consulta (o al listado entero)', async () => {
    const { user } = await show(theme({ showSearch: true }));
    const box = within(screen.getByRole('banner')).getAllByRole('textbox', { name: 'Buscar' })[0]!;
    await user.type(box, ' pesas {Enter}');
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos?q=pesas');
    await user.clear(box);
    await user.type(box, '{Enter}');
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos');
  });

  it('el celular: la búsqueda a la vista con su botón, el menú aparte, y navegar cierra los dos', async () => {
    const { user, rerender } = await show(theme({ showTabsMobile: true, showSearch: true }));
    const menu = screen.getByRole('button', { name: 'Menú' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(menu.getAttribute('aria-controls')!)).not.toBeNull();

    const toggle = screen.getByRole('button', { name: 'Buscar productos' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const box = within(document.getElementById(toggle.getAttribute('aria-controls')!)!).getByRole(
      'searchbox',
      {
        name: 'Buscar',
      },
    );
    expect(box).toHaveFocus(); // se abre para escribir
    await user.type(box, 'soga{Enter}');
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos?q=soga');

    nav.at('/productos');
    rerender(
      <PreviewContext.Provider value={false}>
        <Header theme={theme({ showTabsMobile: true, showSearch: true })} tenantName="Tienda Seed" />
      </PreviewContext.Provider>,
    );
    await settle(1);
    // Navegar cierra los dos: queda solo la búsqueda del escritorio.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menú' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('con el menú del celular apagado, la búsqueda igual está a la vista', async () => {
    const { user } = await show(theme({ showTabsMobile: false, showSearch: true }));
    expect(screen.queryByRole('button', { name: 'Menú' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Buscar productos' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument();
  });

  it('sin búsqueda en el diseño, tampoco el botón del celular', async () => {
    await show(theme({ showSearch: false }));
    expect(screen.queryByRole('button', { name: 'Buscar productos' })).not.toBeInTheDocument();
  });

  it('transparente sobre la portada hasta que se scrollea; borde y nivel elegibles', async () => {
    for (const [level, alpha] of [
      ['full', 'rgba(27, 21, 16, 0)'],
      ['light', 'rgba(27, 21, 16, 0.25)'],
      ['medium', 'rgba(27, 21, 16, 0.5)'],
    ] as const) {
      const { unmount } = await show(
        theme({ transparentOnHome: true, transparentLevel: level, border: 'line', textColor: '0 0 0' }),
      );
      expect(screen.getByRole('banner').getAttribute('style')).toContain(alpha);
      unmount();
    }

    await show(theme({ transparentOnHome: true, border: 'shadow' }));
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('banner').getAttribute('style')).toContain('rgb(27, 21, 16)');
    expect(screen.getByRole('banner')).toHaveClass('shadow-lg');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('el contador del carrito y de favoritos', async () => {
    localStorage.setItem(
      `tiendafy.cart.${fixtureTenantId}`,
      JSON.stringify([
        {
          variantId: 'v',
          productName: 'P',
          variantLabel: 'Única',
          priceAmount: 1,
          currency: 'ARS',
          image: null,
          quantity: 3,
        },
      ]),
    );
    localStorage.setItem(`tiendafy.favorites.${fixtureTenantId}`, JSON.stringify(['a', 'b']));
    mockApi().on('GET', '/api/v1/shop/auth/me', {}, 401);
    await show(theme());
    // El número también para el lector de pantalla, no solo en el globito.
    expect(screen.getAllByRole('button', { name: 'Abrir carrito, 3 productos' })[0]).toHaveTextContent('3');
    expect(screen.getAllByRole('link', { name: 'Favoritos' })[0]).toHaveTextContent('2');
  });
});

describe('barra de anuncio', () => {
  const items = [
    { text: 'Envío gratis', link: '/productos' },
    { text: 'Cuotas sin interés', link: '' },
    { text: '   ', link: '' },
  ];

  it.each(['static', 'marquee'] as const)('%s: los avisos con y sin link', async (animation) => {
    await show(theme({}, { announcement: { show: true, animation, items } }));
    expect(screen.getAllByRole('link', { name: 'Envío gratis' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cuotas sin interés').length).toBeGreaterThan(0);
  });

  it('apagada o sin texto no se muestra', async () => {
    await show(
      theme({}, { announcement: { show: true, animation: 'static', items: [{ text: ' ', link: '' }] } }),
    );
    expect(document.querySelector('[data-tf-focus="announcement"]')).toBeNull();
  });
});

describe('dentro del editor', () => {
  it('al pasar el mouse ofrece editar el anuncio y el encabezado', async () => {
    const parent = { postMessage: vi.fn() };
    const original = Object.getOwnPropertyDescriptor(window, 'parent')!;
    Object.defineProperty(window, 'parent', { value: parent, configurable: true });
    try {
      const { user } = await show(
        theme(
          { sticky: false },
          { announcement: { show: true, animation: 'static', items: [{ text: 'Hola', link: '' }] } },
        ),
        { preview: true },
      );
      fireEvent.mouseEnter(document.querySelector('[data-tf-focus="announcement"]')!);
      await user.click(screen.getByRole('button', { name: /Editar barra de anuncio/ }));
      expect(parent.postMessage).toHaveBeenCalledWith(
        { type: EDITOR_MSG.editSection, target: 'announcement' },
        ADMIN_ORIGIN,
      );
      fireEvent.mouseLeave(document.querySelector('[data-tf-focus="announcement"]')!);

      fireEvent.mouseEnter(screen.getByRole('banner'));
      await user.click(screen.getByRole('button', { name: /Editar encabezado/ }));
      expect(parent.postMessage).toHaveBeenCalledWith(
        { type: EDITOR_MSG.editSection, target: 'header' },
        ADMIN_ORIGIN,
      );
      fireEvent.mouseLeave(screen.getByRole('banner'));
      expect(screen.queryByRole('button', { name: /Editar encabezado/ })).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'parent', original);
    }
  });
});

describe('pie', () => {
  it('redes, medios de pago, páginas publicadas y newsletter', async () => {
    await show(
      theme(
        {},
        {
          footer: {
            ...base.footer,
            instagram: 'https://instagram.com/seed',
            facebook: 'https://facebook.com/seed',
            tiktok: 'https://tiktok.com/@seed',
            youtube: 'https://youtube.com/@seed',
            x: 'https://x.com/seed',
            paymentLogos: ['visa'],
            showNewsletter: true,
            showPages: true,
          } as ThemeConfig['footer'],
        },
      ),
    );
    const footer = within(screen.getByRole('contentinfo'));
    for (const red of ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'X'])
      expect(footer.getByRole('link', { name: red })).toBeInTheDocument();
    if (page) expect(footer.getByRole('link', { name: page.title })).toBeInTheDocument();
  });

  it('los contactos: WhatsApp, teléfono y email como links, la dirección como texto', async () => {
    await show(
      theme(
        {},
        {
          footer: {
            ...base.footer,
            whatsapps: ['+54 9 11 5555-4444', ''],
            phones: ['011 4555 1234'],
            emails: ['hola@tienda.com'],
            addresses: ['Av. Corrientes 1234, CABA'],
          } as ThemeConfig['footer'],
        },
      ),
    );
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: /\+54 9 11 5555-4444/ })).toHaveAttribute(
      'href',
      'https://wa.me/5491155554444',
    );
    expect(footer.getByRole('link', { name: /011 4555 1234/ })).toHaveAttribute('href', 'tel:01145551234');
    expect(footer.getByRole('link', { name: /hola@tienda.com/ })).toHaveAttribute(
      'href',
      'mailto:hola@tienda.com',
    );
    expect(footer.getByText('Av. Corrientes 1234, CABA')).toBeInTheDocument();
  });
});
