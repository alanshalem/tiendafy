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

/** Un inicio que arranca con una foto: lo único sobre lo que el encabezado va transparente. */
const withHero: ThemeConfig['sections'] = [
  {
    id: 'c',
    type: 'carousel',
    visible: true,
    data: { slides: [{ image: 'https://cdn.example.com/a.jpg' }] },
  },
];

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

  it('transparente sobre la foto de portada hasta que se scrollea: menú blanco, encima de la foto', async () => {
    const t = theme(
      { transparentOnHome: true, border: 'shadow', textColor: '0 0 0' },
      { sections: withHero },
    );
    await show(t);
    const banner = screen.getByRole('banner');
    // Sobre la foto el texto va en blanco (el negro elegido no se leería) y sin borde.
    expect(banner.style.color).toBe('rgb(255, 255, 255)');
    expect(banner).not.toHaveClass('shadow-lg');
    // Se superpone a la portada: el contenido sube lo que mide (jsdom mide 0).
    expect(banner.style.marginBottom).toMatch(/^-?0(px)?$/);

    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(banner.getAttribute('style')).toContain('rgb(27, 21, 16)');
    expect(banner.style.color).toBe('rgb(0, 0, 0)');
    expect(banner).toHaveClass('shadow-lg');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('regresión: transparente sin foto de portada queda sólido (antes el menú blanco desaparecía)', async () => {
    await show(theme({ transparentOnHome: true, textColor: '' }, { sections: [] }));
    const banner = screen.getByRole('banner');
    expect(banner.getAttribute('style')).toContain('rgb(27, 21, 16)');
    expect(banner.style.marginBottom).toBe('');
  });

  it('transparente usa el logo para la foto, y el de siempre al scrollear', async () => {
    await show(
      theme(
        { transparentOnHome: true, transparentLogo: 'https://cdn.example.com/blanco.png' },
        { sections: withHero, logo: 'https://cdn.example.com/logo.png' },
      ),
    );
    const src = () => screen.getAllByRole('img', { name: 'Tienda Seed' })[0]!.getAttribute('src');
    expect(src()).toBe('https://cdn.example.com/blanco.png');
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(src()).toBe('https://cdn.example.com/logo.png');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('regresión: sin color de texto elegido, el que se lee sobre el fondo (antes blanco siempre)', async () => {
    const { unmount } = await show(theme({ bg: '255 255 255', textColor: '', border: 'line' }));
    expect(screen.getByRole('banner').style.color).toBe('rgb(17, 24, 39)');
    // La línea sigue al texto: blanca no se veía sobre un encabezado claro.
    expect(screen.getByRole('banner')).toHaveClass('border-current/15');
    unmount();
    await show(theme({ bg: '27 21 16', textColor: '' }));
    expect(screen.getByRole('banner').style.color).toBe('rgb(255, 255, 255)');
  });

  it('regresión: "menú a la derecha" apoya el menú contra los íconos (era igual al clásico)', async () => {
    const { unmount } = await show(theme({ layout: 'menu-right' }));
    expect(screen.getAllByRole('navigation')[0]).toHaveClass('justify-end');
    unmount();
    await show(theme({ layout: 'classic' }));
    expect(screen.getAllByRole('navigation')[0]).toHaveClass('justify-center');
  });

  it('los tres tamaños del logo son distintos', async () => {
    const classes = [];
    for (const logoSize of ['sm', 'md', 'lg'] as const) {
      const { unmount } = await show(theme({ logoSize }));
      classes.push(screen.getAllByText('Tienda Seed')[0]!.className);
      unmount();
    }
    expect(new Set(classes).size).toBe(3);
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
    await show(theme({}, { announcement: { ...base.announcement, show: true, animation, items } }));
    expect(screen.getAllByRole('link', { name: 'Envío gratis' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cuotas sin interés').length).toBeGreaterThan(0);
  });

  it('apagada o sin texto no se muestra', async () => {
    await show(
      theme({}, { announcement: { ...base.announcement, show: true, items: [{ text: ' ', link: '' }] } }),
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
          { announcement: { ...base.announcement, show: true, items: [{ text: 'Hola', link: '' }] } },
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

  it('en columnas: marca, links, contacto y novedades, con color de fondo propio y texto legible', async () => {
    await show(
      theme(
        {},
        {
          footer: {
            ...base.footer,
            layout: 'columns',
            bg: '20 20 20',
            text: 'Hecho en Rosario',
            instagram: 'https://instagram.com/seed',
            links: [{ label: 'Envíos', href: '/productos' }],
            emails: ['hola@tienda.com'],
            showNewsletter: true,
            newsletterTitle: 'Novedades',
          },
        },
      ),
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer.style.background).toBe('rgb(20, 20, 20)');
    expect(footer.style.color).toBe('rgb(255, 255, 255)');
    const f = within(footer);
    for (const title of ['Información', 'Contacto', 'Novedades'])
      expect(f.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(f.getByRole('link', { name: 'Envíos' })).toBeInTheDocument();
    expect(f.getByRole('link', { name: 'Instagram' })).toBeInTheDocument();
    expect(f.getByRole('link', { name: /Botón de arrepentimiento/ })).toBeInTheDocument();
  });

  it('un tema guardado antes de las columnas sigue con el pie centrado y el fondo de la tienda', () => {
    const old = mergeTheme({ footer: { text: 'viejo' } as ThemeConfig['footer'] });
    expect(old.footer.layout).toBe('centered');
    expect(old.footer.bg).toBe('');
    expect(mergeTheme({ footer: { bg: 'rojo' } as unknown as ThemeConfig['footer'] }).footer.bg).toBe('');
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
