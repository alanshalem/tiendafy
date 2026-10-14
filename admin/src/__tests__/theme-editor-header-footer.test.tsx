/**
 * Encabezado, pie, WhatsApp, "en construcción" y la guía del editor: los
 * selectores visuales guardan lo que muestran, el color "automático" se
 * puede elegir y deshacer, y los avisos aparecen cuando una opción no se
 * va a notar (transparente sin foto de portada, WhatsApp sin número).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { normalizeTheme, type ThemeConfig } from '@tiendafy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderPanel } from '../pages/theme-editor-header';
import { FooterPanel } from '../pages/theme-editor-footer';
import { WhatsAppPanel } from '../pages/theme-editor-contact';
import { ComingSoonPanel } from '../pages/theme-editor-pages';
import { checklistItems } from '../pages/theme-editor-nav';
import { searchOptions } from '../pages/theme-editor-search';
import { mockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

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
  return <>{render(theme, (u) => setTheme((t) => (current = u(t))))}</>;
}

async function show(render: (t: ThemeConfig, u: Update) => ReactNode, initial: Partial<ThemeConfig> = {}) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  current = normalizeTheme(initial);
  renderWithProviders(<Harness initial={current} render={render} />);
  await settle(4);
  return user;
}

const header = (initial: Partial<ThemeConfig> = {}) =>
  show((t, u) => <HeaderPanel theme={t} updateTheme={u} onBack={() => {}} />, initial);

/** Las secciones de un inicio que arranca con una foto. */
const withHero: ThemeConfig['sections'] = [
  { id: 'c', type: 'carousel', visible: true, data: { slides: [{ image: 'https://x.test/a.jpg' }] } },
];

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
});
afterEach(() => expect(crashes()).toEqual([]));

describe('encabezado', () => {
  it('disposición, tamaño del logo y borde con su muestra, y queda marcado lo elegido', async () => {
    const user = await header();
    const layout = screen.getByRole('group', { name: 'Disposición en la computadora' });
    await user.click(within(layout).getByRole('button', { name: 'Menú a la derecha' }));
    expect(current.header.layout).toBe('menu-right');
    expect(within(layout).getByRole('button', { name: 'Menú a la derecha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(
      within(screen.getByRole('group', { name: 'Tamaño del logo' })).getByRole('button', { name: /Grande/ }),
    );
    expect(current.header.logoSize).toBe('lg');
    await user.click(
      within(screen.getByRole('group', { name: 'Borde inferior' })).getByRole('button', { name: /Sombra/ }),
    );
    expect(current.header.border).toBe('shadow');
  });

  it('el texto vuelve a automático (el que se lee sobre el fondo)', async () => {
    const user = await header({ header: { ...normalizeTheme({}).header, textColor: '10 10 10' } });
    await user.click(screen.getByRole('button', { name: 'Volver a automático' }));
    expect(current.header.textColor).toBe('');
    expect(screen.getByText(/Automático: el que mejor se lee/)).toBeInTheDocument();
  });

  it('transparente sin foto de portada avisa que se va a ver sólido; con foto, no', async () => {
    const user = await header({ sections: [] });
    await user.click(screen.getByRole('checkbox', { name: 'Transparente sobre la foto de portada' }));
    expect(current.header.transparentOnHome).toBe(true);
    expect(screen.getByText(/Tu inicio no arranca con una foto/)).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('group', { name: 'Velo detrás del menú' })).getByRole('button', {
        name: /Medio/,
      }),
    );
    expect(current.header.transparentLevel).toBe('medium');
  });

  it('con foto de portada no hay aviso', async () => {
    await header({ sections: withHero, header: { ...normalizeTheme({}).header, transparentOnHome: true } });
    expect(screen.queryByText(/Tu inicio no arranca con una foto/)).not.toBeInTheDocument();
  });
});

describe('barra de anuncio', () => {
  const withAnn = (patch: Partial<ThemeConfig['announcement']> = {}) => ({
    announcement: { ...normalizeTheme({}).announcement, show: true, ...patch },
  });

  it('los tres modos con su dibujito: el intervalo solo en "uno por vez" y la velocidad solo desplazándose', async () => {
    const user = await header(withAnn({ items: [{ text: 'Envío gratis', link: '' }] }));
    const modes = screen.getByRole('group', { name: 'Cómo se ven los anuncios' });
    expect(within(modes).getByRole('button', { name: 'Fijo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Cada cuánto cambia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Velocidad' })).not.toBeInTheDocument();

    await user.click(within(modes).getByRole('button', { name: 'Uno por vez' }));
    expect(current.announcement.animation).toBe('rotate');
    expect(screen.getByText(/cambia solo al siguiente/)).toBeInTheDocument();
    const interval = screen.getByRole('combobox', { name: 'Cada cuánto cambia' });
    expect(interval).toHaveValue('5');
    // De 3 a 10 segundos, nada más.
    expect(
      within(interval)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([3, 4, 5, 6, 7, 8, 9, 10].map((n) => `${n} segundos`));
    await user.selectOptions(interval, '8');
    expect(current.announcement.interval).toBe(8);
    expect(screen.queryByRole('group', { name: 'Velocidad' })).not.toBeInTheDocument();

    await user.click(within(modes).getByRole('button', { name: 'Desplazándose' }));
    expect(current.announcement.animation).toBe('marquee');
    expect(screen.queryByRole('combobox', { name: 'Cada cuánto cambia' })).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole('group', { name: 'Velocidad' })).getByRole('button', { name: 'Rápida' }),
    );
    expect(current.announcement.speed).toBe('fast');
  });

  it('los anuncios como filas con menú ⋯: el título es el texto, sin "Cambiar nombre"', async () => {
    const user = await header(
      withAnn({
        items: [
          { text: 'Envío gratis', link: '/productos' },
          { text: '3 cuotas', link: '' },
        ],
      }),
    );
    const list = screen.getByRole('group', { name: 'Anuncios' });
    await user.click(within(list).getByRole('button', { name: 'Más acciones de «3 cuotas»' }));
    const menu = within(screen.getByRole('menu'));
    expect(menu.queryByRole('menuitem', { name: 'Cambiar nombre' })).not.toBeInTheDocument();
    await user.click(menu.getByRole('menuitem', { name: 'Mover arriba' }));
    expect(current.announcement.items.map((i) => i.text)).toEqual(['3 cuotas', 'Envío gratis']);

    await user.click(within(list).getByRole('button', { name: /Agregar anuncio/ }));
    expect(current.announcement.items).toHaveLength(3);
    // Recién agregado viene abierto para escribir; el título de la fila sigue al texto.
    const text = within(list).getAllByRole('textbox', { name: 'Texto' }).at(-1)!;
    await user.type(text, 'Cupón BIENVENIDA');
    expect(current.announcement.items[2]).toMatchObject({ text: 'Cupón BIENVENIDA', link: '' });
    expect(
      within(list).getByRole('button', { name: 'Cupón BIENVENIDA', expanded: true }),
    ).toBeInTheDocument();
  });
});

describe('colores del encabezado por página', () => {
  const panel = (initial: Partial<ThemeConfig> = {}, onPreviewPage = vi.fn()) =>
    show(
      (t, u) => <HeaderPanel theme={t} updateTheme={u} onBack={() => {}} onPreviewPage={onPreviewPage} />,
      initial,
    );

  it('plegado; una página deja de ser "igual que el general", cambia de color y la vista previa va ahí', async () => {
    const onPreviewPage = vi.fn();
    const user = await panel({}, onPreviewPage);
    const toggle = screen.getByRole('button', { name: 'Colores por página' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(screen.getByText(/oscuro solo en el inicio/)).toBeInTheDocument();
    for (const name of [
      'Inicio',
      'Listado y categorías',
      'Producto',
      'Páginas de contenido',
      'Checkout (pago)',
    ])
      expect(
        within(screen.getByRole('group', { name })).getByRole('checkbox', { name: 'Igual que el general' }),
      ).toBeChecked();

    const home = within(screen.getByRole('group', { name: 'Inicio' }));
    await user.click(home.getByRole('checkbox', { name: 'Igual que el general' }));
    // Arranca con el fondo general y el texto en automático.
    expect(current.header.pageColors).toEqual({ home: { bg: current.header.bg, textColor: '' } });
    expect(onPreviewPage).toHaveBeenLastCalledWith('home');

    fireEvent.change(home.getByLabelText('Fondo'), { target: { value: '#ffffff' } });
    expect(current.header.pageColors.home).toEqual({ bg: '255 255 255', textColor: '' });

    const product = within(screen.getByRole('group', { name: 'Producto' }));
    await user.click(product.getByRole('checkbox', { name: 'Igual que el general' }));
    expect(onPreviewPage).toHaveBeenLastCalledWith('product');
    fireEvent.change(product.getByLabelText('Texto e íconos'), { target: { value: '#000000' } });
    expect(current.header.pageColors.product?.textColor).toBe('0 0 0');
    await user.click(product.getByRole('button', { name: 'Volver a automático' }));
    expect(current.header.pageColors.product?.textColor).toBe('');

    // Volver a "igual" la saca: esa página usa otra vez los colores generales.
    await user.click(home.getByRole('checkbox', { name: 'Igual que el general' }));
    expect(Object.keys(current.header.pageColors)).toEqual(['product']);
    // El general no se tocó.
    expect(current.header.bg).toBe(normalizeTheme({}).header.bg);
  });

  it('con colores propios guardados viene abierto; en el inicio transparente avisa cuándo se ve', async () => {
    await panel({
      header: {
        ...normalizeTheme({}).header,
        transparentOnHome: true,
        pageColors: { home: { bg: '250 250 250', textColor: '' } },
      },
    });
    expect(screen.getByRole('button', { name: 'Colores por página' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/este color se ve al bajar/)).toBeInTheDocument();
  });
});

describe('pie', () => {
  it('"En columnas" pone la disposición y el color de fondo vuelve a como la tienda', async () => {
    const user = await show((t, u) => <FooterPanel theme={t} updateTheme={u} onBack={() => {}} />, {
      footer: { ...normalizeTheme({}).footer, bg: '20 20 20' },
    });
    await user.click(screen.getAllByRole('button', { name: /En columnas/ })[0]!);
    expect(current.footer.layout).toBe('columns');
    expect(current.footer.showNewsletter).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Volver a como la tienda' }));
    expect(current.footer.bg).toBe('');
  });
});

describe('pie: columnas', () => {
  const kinds = () => current.footer.columns.map((c) => c.kind);
  const columnsList = () => within(screen.getByRole('list', { name: 'Columnas del pie' }));
  async function rowAction(user: ReturnType<typeof userEvent.setup>, name: string, action: string) {
    await user.click(screen.getByRole('button', { name: `Más acciones de «${name}»` }));
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: action }));
  }
  const footer = (initial: Partial<ThemeConfig> = {}, onFocusPreview?: (t: string) => void) =>
    show(
      (t, u) => <FooterPanel theme={t} updateTheme={u} onBack={() => {}} onFocusPreview={onFocusPreview} />,
      initial,
    );

  it('agregar: elegir el tipo (los de una sola vez, apagados), armar sus links y respetar el tope', async () => {
    const focused: string[] = [];
    const user = await footer({}, (t) => focused.push(t));
    // El tema de fábrica: marca y contacto.
    expect(columnsList().getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Agregar columna' }));
    const picker = within(screen.getByRole('group', { name: 'Tipo de columna' }));
    expect(picker.getByRole('button', { name: /^Marca y redes · ya está/ })).toBeDisabled();
    expect(picker.getByRole('button', { name: /^Contacto · ya está/ })).toBeDisabled();
    await user.click(picker.getByRole('button', { name: /^Links/ }));
    expect(kinds()).toEqual(['social', 'contact', 'links']);
    const added = current.footer.columns[2]!;
    // Se abre sola y se resalta en la vista previa.
    expect(focused).toEqual([`footer-col:${added.id}`]);

    await user.type(screen.getByRole('textbox', { name: 'Título' }), 'Ayuda');
    expect(current.footer.columns[2]!.title).toBe('Ayuda');
    expect(columnsList().getByRole('button', { name: /^Ayuda/, expanded: true })).toBeInTheDocument();

    // Su primer link: el texto y a dónde lleva, con el selector de links.
    await user.type(screen.getByRole('textbox', { name: 'Texto' }), 'Envíos');
    await user.click(screen.getByRole('button', { name: /Elegir a dónde lleva/ }));
    await user.click(
      within(screen.getByRole('group', { name: 'Tipo de destino' })).getByRole('button', { name: /Página/ }),
    );
    await user.click(
      within(screen.getByRole('list', { name: 'Páginas' })).getByRole('button', { name: 'Contacto' }),
    );
    expect(current.footer.columns[2]!.links).toEqual([{ label: 'Envíos', href: '/contacto' }]);
    await user.click(screen.getByRole('button', { name: 'Agregar link' }));
    expect(current.footer.columns[2]!.links).toHaveLength(2);
    await user.click(screen.getByRole('checkbox', { name: /Sumar tus páginas de contenido/ }));
    expect(current.footer.columns[2]!.withPages).toBe(true);
    expect(current.footer.showPages).toBe(true);

    // Hasta 5: texto (puede haber varios) y novedades.
    await user.click(screen.getByRole('button', { name: 'Agregar columna' }));
    await user.click(screen.getByRole('button', { name: /^Texto/ }));
    await user.click(screen.getByRole('button', { name: 'Agregar columna' }));
    await user.click(screen.getByRole('button', { name: /^Suscripción a novedades/ }));
    expect(kinds()).toEqual(['social', 'contact', 'links', 'text', 'newsletter']);
    expect(current.footer.showNewsletter).toBe(true);
    expect(screen.getByRole('button', { name: 'Agregar columna' })).toBeDisabled();
    expect(screen.getByText(/Llegaste al máximo de 5 columnas/)).toBeInTheDocument();
  });

  it('mover, cambiar nombre y eliminar desde el menú ⋯', async () => {
    const user = await footer();
    await user.click(screen.getByRole('button', { name: 'Más acciones de «Marca y redes»' }));
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Mover arriba' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');

    await rowAction(user, 'Contacto', 'Mover arriba');
    expect(kinds()).toEqual(['contact', 'social']);

    await rowAction(user, 'Contacto', 'Cambiar nombre');
    await user.type(screen.getByRole('textbox', { name: 'Nombre de la columna' }), 'Hablanos{Enter}');
    expect(current.footer.columns[0]!.title).toBe('Hablanos');
    expect(columnsList().getByRole('button', { name: /^Hablanos/ })).toBeInTheDocument();

    // Eliminar pide confirmación.
    await rowAction(user, 'Hablanos', 'Eliminar');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('«Hablanos»');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await settle(2);
    expect(kinds()).toEqual(['social']);
  });

  it('el nombre de la columna de novedades es el título de siempre', async () => {
    const base = normalizeTheme({}).footer;
    const user = await footer({ footer: { ...base, columns: [{ id: 'n', kind: 'newsletter' }] } });
    await rowAction(user, 'Recibí novedades y ofertas', 'Cambiar nombre');
    const name = screen.getByRole('textbox', { name: 'Nombre de la columna' });
    await user.clear(name);
    await user.type(name, 'Sumate{Enter}');
    expect(current.footer.newsletterTitle).toBe('Sumate');
    expect(current.footer.columns[0]!.title).toBeUndefined();
  });

  it('"Mínimo" saca las páginas y las novedades, y deja los links que armó el comercio', async () => {
    const user = await footer({
      footer: {
        layout: 'columns',
        showPages: true,
        showNewsletter: true,
        links: [{ label: 'Envíos', href: '/envios' }],
      } as ThemeConfig['footer'],
    });
    expect(kinds()).toEqual(['social', 'links', 'contact', 'newsletter']);
    await user.click(screen.getByRole('button', { name: /^Mínimo/ }));
    expect(kinds()).toEqual(['social', 'links', 'contact']);
    expect(current.footer.columns[1]).toEqual({
      id: 'links',
      kind: 'links',
      links: [{ label: 'Envíos', href: '/envios' }],
    });
    expect(current.footer.showPages).toBe(false);
    expect(current.footer.layout).toBe('centered');
  });
});

describe('botón de WhatsApp', () => {
  it('posición, texto al lado y aviso sin número', async () => {
    const user = await show((t, u) => <WhatsAppPanel theme={t} updateTheme={u} onBack={() => {}} />, {
      whatsappButton: { ...normalizeTheme({}).whatsappButton, enabled: true },
    });
    expect(screen.getByText(/Sin número el botón no aparece/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Abajo a la izquierda/ }));
    expect(current.whatsappButton.position).toBe('left');
    await user.type(screen.getByRole('textbox', { name: /Texto al lado del ícono/ }), '¿Te ayudamos?');
    expect(current.whatsappButton.label).toBe('¿Te ayudamos?');
    await user.type(screen.getByRole('textbox', { name: /Número de WhatsApp/ }), '5491122334455');
    expect(screen.queryByText(/Sin número el botón no aparece/)).not.toBeInTheDocument();
  });
});

describe('tienda en construcción', () => {
  it('el diseño se elige con su muestra y avisa si falta la imagen', async () => {
    const user = await show((t, u) => <ComingSoonPanel theme={t} updateTheme={u} onBack={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Imagen al costado/ }));
    expect(current.comingSoon.layout).toBe('split');
    expect(screen.getByText(/necesita una imagen/)).toBeInTheDocument();
  });
});

describe('guía "Poné tu tienda linda"', () => {
  it('un tema recién creado arranca con todos los pasos por hacer', () => {
    expect(checklistItems(normalizeTheme(null)).filter((i) => i.done)).toEqual([]);
  });

  it('cada paso se marca con lo que pide', () => {
    const base = normalizeTheme({});
    const t = normalizeTheme({
      logo: '/l.png',
      colors: { ...base.colors, primary: '1 2 3' },
      sections: withHero,
      footer: { ...base.footer, instagram: 'instagram.com/x' },
      whatsappButton: { ...base.whatsappButton, enabled: true, phone: '+54 9 11 1234 5678' },
      contact: { ...base.contact, email: 'a@b.c' },
    });
    expect(checklistItems(t).every((i) => i.done)).toBe(true);
  });
});

describe('buscador de opciones', () => {
  it.each([
    ['logo grande', 'header'],
    ['columnas', 'footer'],
    ['izquierda', 'whatsapp'],
    ['hamburguesa', 'header'],
    ['rotativo', 'header'],
    ['color del encabezado', 'header'],
    ['barra de anuncios', 'header'],
  ])('«%s» lleva a %s', (q, view) => {
    expect(searchOptions(q).some((e) => e.view === view)).toBe(true);
  });
});
