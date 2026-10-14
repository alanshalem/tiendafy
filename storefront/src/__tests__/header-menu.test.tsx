/**
 * El menú armable del encabezado: lo que el comercio agrega en el editor
 * (categorías con sus subcategorías, productos, páginas, links propios, con
 * un nivel de anidado), cómo se migra lo guardado con el formato viejo, que
 * los links estén en el HTML del servidor (SEO), y que los desplegables se
 * manejen con mouse, teclado y en el celular. También los links del anuncio y
 * del pie, que nunca dibujan un destino inválido.
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { normalizeTheme, type ThemeMenuItem } from '@tiendafy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../components/store/StoreHeader';
import { Footer } from '../components/store/StoreFooter';
import { StoreCategoriesProvider, type Cat } from '../components/store/CategoryMenu';
import { buildHeaderMenu } from '../components/store/header-menu';
import { PreviewContext } from '../components/store/preview';
import { mergeTheme, type ThemeConfig } from '../lib/theme';
import { fixture, mockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore, StoreProviders } from '../test/store';

const base = mergeTheme(fixture<ThemeConfig>('/api/v1/theme'));
const pages = fixture<{ items: { id: string; title: string; slug: string }[] }>(
  '/api/v1/pages/published',
).items;

/** Un árbol de categorías propio: ropa → (remeras → oversize), (pantalones); accesorios. */
const CATS: Cat[] = [
  { id: 'ropa', name: 'Ropa', parentId: null, path: 'ropa' },
  { id: 'remeras', name: 'Remeras', parentId: 'ropa', path: 'ropa/remeras' },
  { id: 'oversize', name: 'Oversize', parentId: 'remeras', path: 'ropa/remeras/oversize' },
  { id: 'pantalones', name: 'Pantalones', parentId: 'ropa', path: 'ropa/pantalones' },
  { id: 'accesorios', name: 'Accesorios', parentId: null, path: 'accesorios' },
];

const MENU: ThemeMenuItem[] = [
  { id: 'home', visible: true },
  {
    id: 'cat:ropa',
    visible: true,
    kind: 'category',
    label: 'Ropa',
    href: '/productos?category=ropa',
    showChildren: true,
  },
  {
    id: 'cat:accesorios',
    visible: true,
    kind: 'category',
    label: 'Accesorios',
    href: '/productos?category=accesorios',
    showChildren: true,
  },
  { id: 'link:ayuda', visible: true, kind: 'link', label: 'Ayuda', href: '/paginas/como-comprar' },
  {
    id: 'link:mayoristas',
    visible: true,
    kind: 'link',
    label: 'Mayoristas',
    href: 'mayoristas.cking.com.ar',
    newTab: true,
    parent: 'link:ayuda',
  },
  {
    id: 'prod:remera',
    visible: true,
    kind: 'product',
    label: 'Remera Oversize',
    href: '/productos/remera-oversize',
    parent: 'link:ayuda',
  },
  { id: 'link:malo', visible: true, kind: 'link', label: 'Malo', href: 'javascript:alert(1)' },
  { id: 'categories', visible: false },
];

function theme(menu: ThemeMenuItem[] = MENU, extra: Partial<ThemeConfig> = {}): ThemeConfig {
  return { ...base, ...extra, header: { ...base.header, menu } };
}

function layout(width = 4000) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(60);
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);
}

async function show(t: ThemeConfig, { preview = false } = {}) {
  nav.at('/');
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  const view = renderInStore(
    <PreviewContext.Provider value={preview}>
      <StoreCategoriesProvider categories={CATS}>
        <Header theme={t} tenantName="Tienda Seed" />
        <Footer theme={t} tenantName="Tienda Seed" />
      </StoreCategoriesProvider>
    </PreviewContext.Provider>,
  );
  await settle(2);
  return { user, ...view };
}

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
  layout();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('buildHeaderMenu', () => {
  const page = pages[0]!;

  it('formato viejo ({ id, visible }): mismo orden, ocultos fuera y lo nuevo al final', () => {
    const items = buildHeaderMenu(
      normalizeTheme({
        header: {
          menu: [
            { id: 'contact', visible: true },
            { id: 'home', visible: false },
          ],
        },
      } as never).header.menu,
      [page],
    );
    expect(items.map((i) => i.id)).toEqual(['contact', 'products', 'categories', `page:${page.id}`]);
    expect(items.find((i) => i.id === 'categories')?.kind).toBe('categories');
  });

  it('renombra los fijos y usa el nombre propio de una página', () => {
    const items = buildHeaderMenu(
      [
        { id: 'products', visible: true, kind: 'builtin', label: 'Tienda' },
        { id: `page:${page.id}`, visible: true, kind: 'page', label: 'Ayuda' },
      ],
      [page],
    );
    expect(items.slice(0, 2).map((i) => [i.label, i.href])).toEqual([
      ['Tienda', '/productos'],
      ['Ayuda', `/paginas/${page.slug}`],
    ]);
  });

  it('una página guardada con su destino sale antes de que llegue la lista; despublicada se va', () => {
    const saved: ThemeMenuItem = {
      id: 'page:vieja',
      visible: true,
      kind: 'page',
      label: 'Vieja',
      href: '/paginas/vieja',
    };
    expect(buildHeaderMenu([saved], null).map((i) => i.href)).toContain('/paginas/vieja');
    expect(buildHeaderMenu([saved], []).map((i) => i.id)).not.toContain('page:vieja');
    // Sin destino guardado, recién aparece con la lista.
    expect(buildHeaderMenu([{ id: 'page:x', visible: true }], null).map((i) => i.id)).not.toContain('page:x');
    // Con destino pero sin nombre tampoco: un "Página" que después cambia sería un salto.
    expect(
      buildHeaderMenu([{ id: 'page:y', visible: true, kind: 'page', href: '/paginas/y' }], null).map(
        (i) => i.id,
      ),
    ).not.toContain('page:y');
  });

  it('anidado: los hijos cuelgan del padre; padre oculto se los lleva; huérfano sube', () => {
    const items = buildHeaderMenu(
      [
        { id: 'link:a', visible: true, kind: 'link', label: 'A', href: '/a' },
        { id: 'link:b', visible: true, kind: 'link', label: 'B', href: '/b', parent: 'link:a' },
        { id: 'link:c', visible: false, kind: 'link', label: 'C', href: '/c' },
        { id: 'link:d', visible: true, kind: 'link', label: 'D', href: '/d', parent: 'link:c' },
        { id: 'link:e', visible: true, kind: 'link', label: 'E', href: '/e', parent: 'link:borrado' },
        { id: 'link:f', visible: true, kind: 'link', label: 'F', href: '/f', parent: 'categories' },
      ],
      [],
    );
    expect(items.find((i) => i.id === 'link:a')?.children?.map((c) => c.id)).toEqual(['link:b']);
    expect(items.map((i) => i.id)).not.toContain('link:d');
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(['link:e', 'link:f']));
  });

  it('sin destino válido no se dibuja; sin nombre usa uno genérico', () => {
    const items = buildHeaderMenu(
      [
        { id: 'link:x', visible: true, kind: 'link', href: 'javascript:alert(1)', label: 'X' },
        { id: 'link:y', visible: true, kind: 'link', href: 'www.x.com' },
        { id: 'cat:z', visible: true, kind: 'category', href: '/productos?category=z', label: 'Z' },
      ],
      [],
    );
    expect(items.map((i) => i.id)).not.toContain('link:x');
    expect(items.find((i) => i.id === 'link:y')).toMatchObject({ label: 'Link', href: 'https://www.x.com' });
    expect(items.find((i) => i.id === 'cat:z')?.categoryId).toBeUndefined();
  });

  it('un ítem repetido cuenta una sola vez', () => {
    const items = buildHeaderMenu(
      [
        { id: 'home', visible: true },
        { id: 'home', visible: false },
      ],
      [],
    );
    expect(items.filter((i) => i.id === 'home')).toHaveLength(1);
  });
});

describe('normalizeTheme: el menú', () => {
  it('migra lo viejo, deduce el tipo y deja un solo nivel de anidado', () => {
    const menu = normalizeTheme({
      header: {
        menu: [
          { id: 'home', visible: true },
          { id: 'page:1', visible: false },
          {
            id: 'cat:1',
            visible: true,
            label: '  Ropa  ',
            href: '/productos?category=ropa',
            showChildren: true,
          },
          { id: 'prod:1', visible: true, showChildren: true },
          { id: 'link:1', visible: true, kind: 'raro', newTab: true, parent: 'cat:1' },
          { id: 'link:2', visible: true, parent: 'link:1' },
          { id: 'link:3', visible: true, parent: 'link:3' },
          { id: 'categories', visible: true, parent: 'home' },
          { id: 'link:4', visible: true, parent: 'categories' },
          { nope: true },
          null,
          { id: 'home', visible: true },
        ],
      },
    } as never).header.menu;
    expect(menu.map((m) => [m.id, m.kind])).toEqual([
      ['home', 'builtin'],
      ['page:1', 'page'],
      ['cat:1', 'category'],
      ['prod:1', 'product'],
      ['link:1', 'link'],
      ['link:2', 'link'],
      ['link:3', 'link'],
      ['categories', 'builtin'],
      ['link:4', 'link'],
    ]);
    const by = Object.fromEntries(menu.map((m) => [m.id, m]));
    expect(by['cat:1']).toMatchObject({ label: 'Ropa', showChildren: true });
    expect(by['prod:1']?.showChildren).toBeUndefined(); // solo las categorías despliegan
    expect(by['page:1']?.visible).toBe(false);
    expect(by['link:1']).toMatchObject({ parent: 'cat:1', newTab: true });
    expect(by['link:2']?.parent).toBeUndefined(); // su padre ya es hijo
    expect(by['link:3']?.parent).toBeUndefined(); // de sí mismo
    expect(by['categories']?.parent).toBeUndefined(); // el desplegable de categorías no se anida
    expect(by['link:4']?.parent).toBeUndefined(); // ni recibe hijos
  });

  it('sin menú o con basura: vacío', () => {
    expect(normalizeTheme({ header: { menu: 'x' } } as never).header.menu).toEqual([]);
    expect(normalizeTheme({ header: {} } as never).header.menu).toEqual([]);
  });

  it('quien tiene hijos no puede ser hijo', () => {
    const menu = normalizeTheme({
      header: {
        menu: [
          { id: 'link:a', visible: true },
          { id: 'link:b', visible: true, parent: 'link:a' },
          { id: 'link:c', visible: true, parent: 'link:b' },
        ],
      },
    } as never).header.menu;
    // link:b es hijo de a, así que link:c (que colgaba de b) sube.
    expect(menu.find((m) => m.id === 'link:c')?.parent).toBeUndefined();
    expect(menu.find((m) => m.id === 'link:b')?.parent).toBe('link:a');
  });
});

describe('HTML del servidor', () => {
  it('todos los links del menú, incluidos los de los desplegables, llegan en el HTML', () => {
    nav.at('/');
    const html = renderToString(
      <StoreProviders>
        <StoreCategoriesProvider categories={CATS}>
          <Header theme={theme()} tenantName="Tienda Seed" />
        </StoreCategoriesProvider>
      </StoreProviders>,
    );
    for (const href of [
      'href="/productos?category=ropa"',
      'href="/productos?category=ropa/remeras"',
      'href="/productos?category=ropa/remeras/oversize"',
      'href="/productos?category=ropa/pantalones"',
      'href="/paginas/como-comprar"',
      'href="https://mayoristas.cking.com.ar"',
      'href="/productos/remera-oversize"',
    ])
      expect(html).toContain(href);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('href="#"');
  });
});

describe('encabezado (desktop)', () => {
  const header = () => within(screen.getByRole('banner'));

  it('mega-menú de una categoría: columnas con las subcategorías y "Ver todo"', async () => {
    const { user } = await show(theme());
    const trigger = header().getByRole('button', { name: 'Ropa' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;
    expect(within(panel).getByRole('link', { name: 'Ver todo Ropa' })).toHaveAttribute(
      'href',
      '/productos?category=ropa',
    );
    expect(within(panel).getByRole('link', { name: 'Remeras' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Oversize' })).toBeInTheDocument();
    await user.click(within(panel).getByRole('link', { name: 'Pantalones' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('una categoría sin subcategorías es un link común', async () => {
    await show(theme());
    expect(header().getByRole('link', { name: 'Accesorios' })).toHaveAttribute(
      'href',
      '/productos?category=accesorios',
    );
  });

  it('desplegable propio: el destino del padre primero, después los anidados; externo en otra pestaña', async () => {
    const { user } = await show(theme());
    const trigger = header().getByRole('button', { name: 'Ayuda' });
    await user.click(trigger);
    const panel = within(document.getElementById(trigger.getAttribute('aria-controls')!)!);
    const links = panel.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Ayuda', 'Mayoristas', 'Remera Oversize']);
    expect(panel.getByRole('link', { name: 'Mayoristas' })).toHaveAttribute('target', '_blank');
    expect(panel.getByRole('link', { name: 'Mayoristas' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('teclado: flecha abajo entra, las flechas recorren, Escape cierra y vuelve al botón', async () => {
    const { user } = await show(theme());
    const trigger = header().getByRole('button', { name: 'Ayuda' });
    act(() => trigger.focus());
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = within(document.getElementById(trigger.getAttribute('aria-controls')!)!);
    expect(panel.getByRole('link', { name: 'Ayuda' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(panel.getByRole('link', { name: 'Mayoristas' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(panel.getByRole('link', { name: 'Remera Oversize' })).toHaveFocus();
    await user.keyboard('{ArrowDown}'); // da la vuelta
    expect(panel.getByRole('link', { name: 'Ayuda' })).toHaveFocus();
    await user.keyboard('{Home}{ArrowUp}'); // del primero, vuelve al botón
    expect(trigger).toHaveFocus();
    await user.keyboard('{ArrowUp}'); // flecha arriba abre en el último
    expect(panel.getByRole('link', { name: 'Remera Oversize' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('salir con Tab cierra el desplegable; el mouse lo abre y lo cierra', async () => {
    const { user } = await show(theme());
    const trigger = header().getByRole('button', { name: 'Ayuda' });
    fireEvent.mouseEnter(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseLeave(trigger.parentElement!);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    act(() => trigger.focus());
    await user.keyboard('{ArrowDown}');
    const outside = header().getAllByRole('link', { name: 'Inicio' })[0]!;
    fireEvent.focusOut(trigger.parentElement!.querySelector('a')!, { relatedTarget: outside });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('teclas sueltas no hacen nada con el desplegable cerrado o fuera de la lista', async () => {
    const { user } = await show(theme());
    const trigger = header().getByRole('button', { name: 'Ayuda' });
    act(() => trigger.focus());
    await user.keyboard('{Escape}{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('a{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('lo que no entra va a "Más", con los anidados debajo de su padre', async () => {
    layout(150);
    const { user } = await show(theme());
    const more = header().getByRole('button', { name: /Más/ });
    await user.click(more);
    const panel = within(document.getElementById(more.getAttribute('aria-controls')!)!);
    expect(panel.getByRole('link', { name: 'Mayoristas' })).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'Ayuda' })).toBeInTheDocument();
  });

  it('en la vista previa del editor los links conservan ?preview', async () => {
    await show(theme(), { preview: true });
    expect(header().getByRole('link', { name: 'Accesorios' }).getAttribute('href')).toContain('preview=1');
  });
});

describe('encabezado (celular)', () => {
  it('mismo orden que el desktop; los desplegables son acordeones', async () => {
    const { user } = await show(theme());
    await user.click(screen.getByRole('button', { name: 'Menú' }));
    const panel = within(screen.getByRole('navigation', { name: 'Menú' }));
    const links = panel.getAllByRole('link').map((a) => a.textContent);
    expect(links.indexOf('Inicio')).toBeLessThan(links.indexOf('Ropa'));
    expect(links.indexOf('Ropa')).toBeLessThan(links.indexOf('Ayuda'));

    const open = panel.getByRole('button', { name: 'Abrir Ropa' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await user.click(open);
    expect(panel.getByRole('button', { name: 'Cerrar Ropa' })).toHaveAttribute('aria-expanded', 'true');
    expect(panel.getByRole('link', { name: 'Remeras' })).toBeVisible();

    await user.click(panel.getByRole('button', { name: 'Abrir Ayuda' }));
    expect(panel.getByRole('link', { name: 'Mayoristas' })).toBeVisible();
    // Accesorios no tiene subcategorías: link común, sin flechita.
    expect(panel.queryByRole('button', { name: 'Abrir Accesorios' })).not.toBeInTheDocument();
  });

  it('el desplegable de Categorías del formato viejo sigue en el celular, con su nombre', async () => {
    const { user } = await show(theme([{ id: 'categories', visible: true, label: 'Rubros' }]));
    await user.click(screen.getByRole('button', { name: 'Menú' }));
    const panel = within(screen.getByRole('navigation', { name: 'Menú' }));
    expect(panel.getByText('Rubros')).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'Accesorios' })).toBeInTheDocument();
  });
});

describe('barra de anuncio y pie: links seguros', () => {
  it('anuncio: dominio suelto con https, en otra pestaña; inválido queda como texto', async () => {
    await show(
      theme(MENU, {
        announcement: {
          ...base.announcement,
          show: true,
          items: [
            { text: 'Visitá el blog', link: 'blog.cking.com.ar', newTab: true },
            { text: 'Cuidado', link: 'javascript:alert(1)' },
            { text: 'Ofertas', link: '/productos' },
          ],
        },
      }),
    );
    const blog = screen.getByRole('link', { name: 'Visitá el blog' });
    expect(blog).toHaveAttribute('href', 'https://blog.cking.com.ar');
    expect(blog).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: 'Cuidado' })).not.toBeInTheDocument();
    expect(screen.getByText('Cuidado').tagName).toBe('SPAN');
    expect(screen.getByRole('link', { name: 'Ofertas' })).not.toHaveAttribute('target');
  });

  it('pie: links propios (los inválidos o sin nombre no) y redes completadas con https', async () => {
    await show(
      theme(MENU, {
        footer: {
          ...base.footer,
          showSocial: true,
          instagram: 'instagram.com/cking',
          facebook: 'javascript:alert(1)',
          links: [
            { label: 'Envíos', href: '/paginas/envios' },
            { label: 'Catálogo PDF', href: 'cdn.cking.com.ar/catalogo.pdf', newTab: true },
            { label: 'Malo', href: 'data:text/html,hola' },
            { label: '  ', href: '/x' },
          ],
        },
      }),
    );
    const footer = within(screen.getByRole('contentinfo'));
    const own = within(footer.getByRole('navigation', { name: 'Links del pie' }));
    expect(own.getAllByRole('link').map((a) => a.textContent)).toEqual(['Envíos', 'Catálogo PDF']);
    expect(own.getByRole('link', { name: 'Catálogo PDF' })).toHaveAttribute(
      'href',
      'https://cdn.cking.com.ar/catalogo.pdf',
    );
    expect(footer.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/cking',
    );
    expect(footer.queryByRole('link', { name: 'Facebook' })).not.toBeInTheDocument();
  });
});
