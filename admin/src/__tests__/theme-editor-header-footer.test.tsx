/**
 * Encabezado, pie, WhatsApp, "en construcción" y la guía del editor: los
 * selectores visuales guardan lo que muestran, el color "automático" se
 * puede elegir y deshacer, y los avisos aparecen cuando una opción no se
 * va a notar (transparente sin foto de portada, WhatsApp sin número).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { normalizeTheme, type ThemeConfig } from '@tiendafy/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  ])('«%s» lleva a %s', (q, view) => {
    expect(searchOptions(q).some((e) => e.view === view)).toBe(true);
  });
});
