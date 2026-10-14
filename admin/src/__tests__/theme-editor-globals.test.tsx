/**
 * Las opciones globales del editor de diseño: el menú armable del
 * encabezado (agregar categorías, links y páginas, renombrar, ocultar,
 * ordenar, anidar un nivel, quitar), los links propios del pie y del
 * anuncio, el estilo de botones con su muestra, la galería apilada y las
 * columnas del listado en el celular.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { baseTheme, normalizeTheme, type ThemeConfig, type ThemeMenuItem } from '@tiendafy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuEditor } from '../pages/theme-editor-menu';
import { HeaderPanel } from '../pages/theme-editor-header';
import { FooterPanel } from '../pages/theme-editor-footer';
import { BorderRadiusPanel } from '../pages/theme-editor-style';
import { ProductDetailPanel, ProductListPanel } from '../pages/theme-editor-pages';
import { fixture, mockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

const published = fixture<{ items: { id: string; title: string }[] }>('/api/v1/pages/published').items;
const category = fixture<{ items: { id: string; name: string }[] }>('/api/v1/categories').items[0]!;

/** El tema que tiene el editor en este momento. */
let current: ThemeConfig;

type Update = (u: (t: ThemeConfig) => ThemeConfig) => void;

function Harness({
  initial,
  render,
}: {
  initial: ThemeConfig;
  render: (t: ThemeConfig, u: Update) => ReactNode;
}) {
  const [theme, setTheme] = useState(initial);
  // `current` se actualiza en cada cambio (no en el render: el render es puro).
  return <>{render(theme, (u) => setTheme((t) => (current = u(t))))}</>;
}

async function show(render: (t: ThemeConfig, u: Update) => ReactNode, initial: Partial<ThemeConfig> = {}) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  current = normalizeTheme(initial);
  renderWithProviders(<Harness initial={current} render={render} />);
  await settle(4);
  return user;
}

const menuOf = (t: ThemeConfig) => t.header.menu;
const ids = () => menuOf(current).map((m) => m.id);
const items = () => within(screen.getByRole('list', { name: 'Ítems del menú' }));
/** Los botones que abren cada ítem (no los ⋯ ni el ojo). */
const rowToggles = () =>
  items()
    .getAllByRole('button', { expanded: false })
    .filter(
      (b) => b.hasAttribute('aria-controls') && !b.getAttribute('aria-label')?.startsWith('Más acciones'),
    );
/** Una acción del menú ⋯ de un ítem. */
async function rowAction(user: ReturnType<typeof userEvent.setup>, label: string, action: string | RegExp) {
  await user.click(screen.getByRole('button', { name: `Más acciones de «${label}»` }));
  await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: action }));
}
/** ¿El menú ⋯ de un ítem ofrece esta acción? (y la cierra) */
async function rowOffers(user: ReturnType<typeof userEvent.setup>, label: string, action: string | RegExp) {
  await user.click(screen.getByRole('button', { name: `Más acciones de «${label}»` }));
  const found = within(screen.getByRole('menu')).queryByRole('menuitem', { name: action });
  const enabled = !!found && found.getAttribute('aria-disabled') !== 'true';
  await user.keyboard('{Escape}');
  return { found: !!found, enabled };
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

const menuEditor = (t: ThemeConfig, u: Update) => <MenuEditor theme={t} updateTheme={u} />;

describe('menú del encabezado', () => {
  it('muestra los fijos y las páginas publicadas, en el orden guardado (formato viejo incluido)', async () => {
    await show(menuEditor, { header: { ...baseTheme.header, menu: [{ id: 'contact', visible: true }] } });
    const labels = rowToggles().map((b) => b.textContent);
    expect(labels[0]).toMatch(/^Contacto/);
    expect(labels.join('|')).toMatch(/Inicio.*Productos.*Categorías/);
    for (const p of published) expect(items().getByText(p.title)).toBeInTheDocument();
  });

  it('ordenar, ocultar y renombrar guardan la lista entera', async () => {
    const user = await show(menuEditor);
    await rowAction(user, 'Inicio', 'Mover abajo');
    expect(ids().slice(0, 2)).toEqual(['products', 'home']);
    await rowAction(user, 'Inicio', 'Mover arriba');
    expect(ids().slice(0, 2)).toEqual(['home', 'products']);
    expect((await rowOffers(user, 'Inicio', 'Mover arriba')).enabled).toBe(false);

    await user.click(items().getByRole('button', { name: 'Ocultar Contacto' }));
    expect(menuOf(current).find((m) => m.id === 'contact')?.visible).toBe(false);
    await user.click(items().getByRole('button', { name: 'Mostrar Contacto' }));
    expect(menuOf(current).find((m) => m.id === 'contact')?.visible).toBe(true);

    await user.click(items().getByRole('button', { name: /^Productos/ }));
    const name = screen.getByRole('textbox', { name: 'Nombre en el menú' });
    expect(name).toHaveAttribute('placeholder', 'Productos');
    await user.type(name, 'Tienda');
    expect(menuOf(current).find((m) => m.id === 'products')?.label).toBe('Tienda');
    // Un fijo no se quita ni cambia de destino.
    expect((await rowOffers(user, 'Tienda', /Quitar del menú/)).found).toBe(false);
    expect(screen.queryByRole('group', { name: 'Destino' })).not.toBeInTheDocument();
  });

  it('agregar una categoría con sus subcategorías', async () => {
    const user = await show(menuEditor);
    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    const adder = screen.getByRole('group', { name: 'Nuevo ítem del menú' });
    await user.click(within(adder).getByRole('button', { name: /^Categoría$/ }));
    await user.click(await within(adder).findByRole('button', { name: category.name }));
    const added = menuOf(current).at(-1)!;
    expect(added).toMatchObject({
      id: `cat:${category.id}`,
      kind: 'category',
      label: category.name,
      href: '/productos?category=musculacion',
    });
    // Queda abierto para ajustarlo.
    await user.click(screen.getByRole('checkbox', { name: /Mostrar subcategorías/ }));
    expect(menuOf(current).at(-1)?.showChildren).toBe(true);
    expect(screen.getByRole('group', { name: 'Destino' })).toBeInTheDocument();
  });

  it('agregar un link, meterlo dentro del de arriba, sacarlo y quitarlo', async () => {
    const user = await show(menuEditor, {
      header: {
        ...baseTheme.header,
        menu: [
          { id: 'home', visible: true },
          { id: 'categories', visible: true },
        ],
      },
    });
    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    const adder = screen.getByRole('group', { name: 'Nuevo ítem del menú' });
    await user.click(within(adder).getByRole('button', { name: /^URL$/ }));
    await user.type(within(adder).getByRole('textbox', { name: /Dirección web/ }), 'www.cking.com.ar{Enter}');
    const link = menuOf(current).at(-1)!;
    expect(link).toMatchObject({ kind: 'link', label: 'cking.com.ar', href: 'https://www.cking.com.ar' });
    expect(link.id).toMatch(/^link:/);

    // El de arriba es una página publicada: se puede anidar.
    const above = rowToggles().at(-1)!.textContent!;
    await rowAction(user, 'cking.com.ar', /Meter dentro de/);
    expect(menuOf(current).find((m) => m.id === link.id)?.parent).toMatch(/^page:/);
    expect(
      screen.getByRole('list', { name: new RegExp(`Dentro de ${above.replace(/Página$/, '')}`) }),
    ).toBeInTheDocument();

    // Pestaña nueva desde su editor.
    await user.click(screen.getByRole('checkbox', { name: 'Abrir en pestaña nueva' }));
    expect(menuOf(current).find((m) => m.id === link.id)?.newTab).toBe(true);

    await rowAction(user, 'cking.com.ar', /Sacar al primer nivel/);
    expect(menuOf(current).find((m) => m.id === link.id)?.parent).toBeUndefined();

    await rowAction(user, 'cking.com.ar', /Quitar del menú/);
    expect(ids()).not.toContain(link.id);
  });

  it('subir y bajar un hijo se mueve entre sus hermanos; quitar al padre sube a los hijos', async () => {
    const menu: ThemeMenuItem[] = [
      { id: 'link:padre', visible: true, kind: 'link', label: 'Padre', href: '/a' },
      { id: 'link:h1', visible: true, kind: 'link', label: 'Hijo uno', href: '/b', parent: 'link:padre' },
      { id: 'link:h2', visible: true, kind: 'link', label: 'Hijo dos', href: '/c', parent: 'link:padre' },
    ];
    const user = await show(menuEditor, { header: { ...baseTheme.header, menu } });
    expect(screen.getByRole('list', { name: 'Dentro de Padre' })).toBeInTheDocument();
    expect((await rowOffers(user, 'Hijo uno', 'Mover arriba')).enabled).toBe(false);
    await rowAction(user, 'Hijo uno', 'Mover abajo');
    expect(ids().slice(0, 3)).toEqual(['link:padre', 'link:h2', 'link:h1']);
    // Quien tiene hijos no se puede meter dentro de otro.
    expect((await rowOffers(user, 'Padre', /Meter dentro de/)).found).toBe(false);
    await rowAction(user, 'Padre', /Quitar del menú/);
    expect(
      menuOf(current)
        .filter((m) => m.id.startsWith('link:h'))
        .map((m) => m.parent),
    ).toEqual([undefined, undefined]);
  });

  it('agregar una página que ya estaba (oculta) la vuelve a mostrar sin duplicarla', async () => {
    const page = published[0]!;
    const user = await show(menuEditor, {
      header: { ...baseTheme.header, menu: [{ id: `page:${page.id}`, visible: false }] },
    });
    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    const adder = screen.getByRole('group', { name: 'Nuevo ítem del menú' });
    await user.click(within(adder).getByRole('button', { name: /^Página$/ }));
    await user.click(await within(adder).findByRole('button', { name: page.title }));
    expect(menuOf(current).filter((m) => m.id === `page:${page.id}`)).toEqual([
      expect.objectContaining({ visible: true, href: expect.stringMatching(/^\/paginas\//) }),
    ]);
  });

  it('cancelar el agregado no toca el menú', async () => {
    const user = await show(menuEditor);
    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(menuOf(current)).toEqual([]);
    expect(screen.getByRole('button', { name: /Agregar al menú/ })).toBeInTheDocument();
  });

  it('una página que ya no está publicada se ve como tal', async () => {
    await show(menuEditor, { header: { ...baseTheme.header, menu: [{ id: 'page:vieja', visible: true }] } });
    expect(items().getByText('Página sin publicar')).toBeInTheDocument();
  });

  it('WhatsApp, email y teléfono proponen su nombre', async () => {
    const user = await show(menuEditor);
    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    let adder = screen.getByRole('group', { name: 'Nuevo ítem del menú' });
    await user.click(within(adder).getByRole('button', { name: /^URL$/ }));
    await user.type(
      within(adder).getByRole('textbox', { name: /Dirección web/ }),
      'hola@cking.com.ar{Enter}',
    );
    expect(menuOf(current).at(-1)?.label).toBe('Email');

    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    adder = screen.getByRole('group', { name: 'Nuevo ítem del menú' });
    await user.click(within(adder).getByRole('button', { name: /^URL$/ }));
    await user.type(within(adder).getByRole('textbox', { name: /Dirección web/ }), 'tel:1145551234{Enter}');
    expect(menuOf(current).at(-1)?.label).toBe('Teléfono');

    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    adder = screen.getByRole('group', { name: 'Nuevo ítem del menú' });
    await user.click(within(adder).getByRole('button', { name: /^URL$/ }));
    await user.type(within(adder).getByRole('textbox', { name: /Dirección web/ }), '/ofertas{Enter}');
    expect(menuOf(current).at(-1)?.label).toBe('Link');

    await user.click(screen.getByRole('button', { name: /Agregar al menú/ }));
    adder = screen.getByRole('group', { name: 'Nuevo ítem del menú' });
    await user.click(within(adder).getByRole('button', { name: /^WhatsApp$/ }));
    await user.type(within(adder).getByRole('textbox', { name: /Número/ }), '5491122334455');
    await user.click(within(adder).getByRole('button', { name: 'Usar este WhatsApp' }));
    expect(menuOf(current).at(-1)).toMatchObject({ label: 'WhatsApp', href: 'https://wa.me/5491122334455' });
  });
});

describe('barra de anuncio y pie', () => {
  it('el link del anuncio sale del selector, con pestaña nueva', async () => {
    const user = await show((t, u) => <HeaderPanel theme={t} updateTheme={u} onBack={() => {}} />, {
      announcement: {
        ...baseTheme.announcement,
        show: true,
        items: [{ text: 'Envío gratis', link: '' }],
      },
    });
    // Con la barra prendida, su bloque ya viene abierto.
    expect(screen.getByRole('button', { name: 'Barra de anuncio' })).toHaveAttribute('aria-expanded', 'true');
    const picker = screen.getByRole('group', { name: 'Link (opcional)' });
    await user.click(within(picker).getByRole('button', { name: /Elegir a dónde lleva/ }));
    await user.click(within(picker).getByRole('button', { name: /^Página$/ }));
    await user.click(within(picker).getByRole('button', { name: 'Contacto' }));
    expect(current.announcement.items[0]?.link).toBe('/contacto');
    await user.click(within(picker).getByRole('checkbox', { name: 'Abrir en pestaña nueva' }));
    expect(current.announcement.items[0]?.newTab).toBe(true);
  });

  it('links propios del pie: agregar, elegir destino (propone el texto) y quitar', async () => {
    const user = await show((t, u) => <FooterPanel theme={t} updateTheme={u} onBack={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Agregar link/ }));
    expect(current.footer.links).toEqual([{ label: '', href: '' }]);
    const picker = screen.getByRole('group', { name: 'A dónde lleva' });
    await user.click(within(picker).getByRole('button', { name: /Elegir a dónde lleva/ }));
    await user.click(within(picker).getByRole('button', { name: /^Página$/ }));
    await user.click(within(picker).getByRole('button', { name: 'Favoritos' }));
    expect(current.footer.links[0]).toEqual({ label: 'Favoritos', href: '/favoritos' });

    // Con texto propio, elegir otro destino no lo pisa.
    const text = screen.getByRole('textbox', { name: 'Texto' });
    await user.clear(text);
    await user.type(text, 'Mis favoritos');
    await user.click(within(picker).getByRole('button', { name: 'Cambiar a dónde lleva' }));
    await user.click(within(picker).getByRole('button', { name: 'Contacto' }));
    expect(current.footer.links[0]).toEqual({ label: 'Mis favoritos', href: '/contacto' });
    await user.click(within(picker).getByRole('checkbox', { name: 'Abrir en pestaña nueva' }));
    expect(current.footer.links[0]?.newTab).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Quitar link 1' }));
    expect(current.footer.links).toEqual([]);
  });
});

describe('estilo de botones', () => {
  it('forma, relleno y texto, con la muestra en vivo', async () => {
    const user = await show((t, u) => <BorderRadiusPanel theme={t} updateTheme={u} onBack={() => {}} />);
    const sample = screen.getByTestId('muestra-boton');
    expect(sample.style.borderRadius).toBe('0.5rem'); // como los bordes (redondeado)

    await user.click(screen.getByRole('button', { name: 'Píldora' }));
    expect(current.buttons.shape).toBe('pill');
    expect(sample.style.borderRadius).toBe('9999px');
    await user.click(screen.getByRole('button', { name: 'Recto' }));
    expect(screen.getByTestId('muestra-boton').style.borderRadius).toBe('0px');
    await user.click(
      within(screen.getByRole('group', { name: 'Forma' })).getByRole('button', { name: 'Redondeado' }),
    );
    expect(screen.getByTestId('muestra-boton').style.borderRadius).toBe('0.5rem');

    await user.click(screen.getByRole('button', { name: 'Solo contorno' }));
    expect(current.buttons.variant).toBe('outline');
    expect(screen.getByTestId('muestra-boton').style.background).toBe('transparent');

    await user.click(screen.getByRole('button', { name: 'MAYÚSCULAS' }));
    expect(current.buttons.textCase).toBe('uppercase');
    expect(screen.getByTestId('muestra-boton').style.textTransform).toBe('uppercase');

    // "Como los bordes" sigue a los bordes globales.
    await user.click(screen.getByRole('button', { name: 'Como los bordes' }));
    await user.click(screen.getByRole('button', { name: /Cuadrado/ }));
    expect(screen.getByTestId('muestra-boton').style.borderRadius).toBe('0px');
    await user.click(screen.getByRole('button', { name: /Suave/ }));
    expect(screen.getByTestId('muestra-boton').style.borderRadius).toBe('0.125rem');
  });

  it('un tema sin `buttons` (guardado antes) usa los de siempre', async () => {
    const user = await show((t, u) => (
      <BorderRadiusPanel theme={{ ...t, buttons: undefined as never }} updateTheme={u} onBack={() => {}} />
    ));
    expect(screen.getByRole('button', { name: 'Como los bordes' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Píldora' }));
    expect(current.buttons.shape).toBe('pill');
  });
});

describe('listado y detalle de producto', () => {
  it('la galería apilada se ofrece, cada estilo con su descripción', async () => {
    const user = await show((t, u) => <ProductDetailPanel theme={t} updateTheme={u} onBack={() => {}} />);
    const stacked = screen.getByRole('button', { name: /Apilada/ });
    expect(stacked).toHaveTextContent(/una debajo de la otra/);
    await user.click(stacked);
    expect(current.productDetail.galleryStyle).toBe('stacked');
    expect(stacked).toHaveAttribute('aria-pressed', 'true');
  });

  it('productos por fila en el celular: 2 o 1', async () => {
    const user = await show((t, u) => <ProductListPanel theme={t} updateTheme={u} onBack={() => {}} />);
    const mobile = screen.getByRole('combobox', { name: 'Productos por fila en el celular' });
    expect(mobile).toHaveValue('2');
    await user.selectOptions(mobile, '1');
    expect(current.productList.mobileColumns).toBe(1);
    await user.selectOptions(mobile, '2');
    expect(current.productList.mobileColumns).toBe(2);
  });
});
