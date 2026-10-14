/**
 * El "marco" del editor de diseño: deshacer/rehacer a la vista, la vista
 * previa al ancho real del dispositivo (achicada para que entre), esconder el
 * panel, los campos con tope de caracteres y nombre, y el buscador (Ctrl+K)
 * con las opciones nuevas y las secciones del inicio.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_MSG, type ThemeConfig, type ThemeSection } from '@tiendafy/types';
import { storefrontUrl } from '../lib/storefront';
import { fixture, mockApi } from '../test/api';
import { settle } from '../test/explore';
import { renderApp } from '../test/render';
import { PreviewFrame, previewLayout } from '../pages/theme-editor/PreviewFrame';
import type { Device } from '../pages/theme-editor/EditorTopBar';
import { Field, Select, TextArea, TextInput } from '../pages/theme-editor-inputs';
import { buildOptionIndex, searchOptions } from '../pages/theme-editor-search';

afterEach(() => vi.restoreAllMocks());

const draft = fixture<ThemeConfig>('/api/v1/theme/draft');
const tenant = fixture<{ items: { subdomain: string }[] }>('/api/v1/tenants').items[0]!;
const panel = () => screen.getByRole('complementary', { name: 'Opciones del diseño' });

async function openEditor() {
  const api = mockApi();
  api.on('POST', '/api/v1/theme/preview-token', { token: 'pt-firmado' });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/canales/tienda-online');
  await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
  await settle(6);
  return { api, user };
}

/** Pantalla de md para arriba y un área de vista previa de `w`×`h`. */
function wideScreen(w: number, h: number) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('min-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: { width: w, height: h } } as ResizeObserverEntry], this as never);
      }
      disconnect() {}
    },
  );
}

/* ---------------- deshacer / rehacer ---------------- */

describe('deshacer y rehacer a la vista', () => {
  it('apagados sin historial; deshacen y rehacen; dicen el atajo', async () => {
    const { user } = await openEditor();
    const undo = screen.getByRole('button', { name: 'Deshacer' });
    const redo = screen.getByRole('button', { name: 'Rehacer' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    expect(undo).toHaveAttribute('aria-keyshortcuts', expect.stringContaining('Control+Z'));

    await user.click(within(panel()).getByText('Edición avanzada de CSS'));
    const css = within(panel()).getByRole('textbox');
    await user.type(css, '/* x */');
    expect(undo).toBeEnabled();
    await user.click(undo);
    expect(css).toHaveValue('');
    expect(redo).toBeEnabled();
    await user.click(redo);
    expect(css).toHaveValue('/* x */');

    await user.hover(undo);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Deshacer \((Ctrl|⌘)\+Z\)$/);
  });
});

/* ---------------- vista previa por dispositivo ---------------- */

describe('vista previa al ancho del dispositivo', () => {
  it('calcula ancho, alto y escala', () => {
    // Una notebook: 1120 px al lado del panel. La computadora se dibuja a 1280 y se achica.
    expect(previewLayout('desktop', { width: 1120, height: 844 })).toEqual({
      width: 1280,
      height: Math.round(796 / (1072 / 1280)),
      scale: 1072 / 1280,
      framed: false,
    });
    // Con lugar de sobra, usa todo el ancho sin achicar.
    expect(previewLayout('desktop', { width: 1648, height: 900 })).toMatchObject({ width: 1600, scale: 1 });
    // Una tablet al lado del panel en una tablet (500 px): la tablet entra achicada.
    const tablet = previewLayout('tablet', { width: 500, height: 1124 })!;
    expect(tablet.width).toBe(834);
    expect(tablet.scale).toBeCloseTo(452 / 850);
    expect(tablet.framed).toBe(true);
    // El celular entra entero.
    expect(previewLayout('mobile', { width: 900, height: 800 })).toMatchObject({ width: 390, scale: 1 });
    expect(previewLayout('mobile', { width: 10, height: 800 })).toBeNull();
  });

  it('dibuja el iframe al ancho del dispositivo y lo achica; cambiar no lo recarga', () => {
    wideScreen(1120, 844);
    const view = (device: Device) => (
      <PreviewFrame device={device} hidden={false}>
        <iframe title="Preview" />
      </PreviewFrame>
    );
    const { rerender } = render(view('desktop'));
    const iframe = screen.getByTitle('Preview');
    const box = iframe.parentElement!;
    expect(box.style.width).toBe('1280px');
    expect(box.style.transform).toBe(`scale(${1072 / 1280})`);
    expect(screen.getByText('Computadora · 1280 px · al 84%')).toBeInTheDocument();

    rerender(view('mobile'));
    expect(screen.getByTitle('Preview')).toBe(iframe);
    expect(box.style.width).toBe(`${390 + 16}px`);
    expect(box.style.transform).toBe('');
    expect(box).toHaveClass('border-8');
    expect(screen.getByText('Celular · 390 px')).toBeInTheDocument();
  });

  it('en un celular no emula: la vista previa ocupa la pantalla', () => {
    render(
      <PreviewFrame device="desktop" hidden>
        <iframe title="Preview" />
      </PreviewFrame>,
    );
    const box = screen.getByTitle('Preview').parentElement!;
    expect(box.style.width).toBe('');
    expect(box).toHaveClass('h-full', 'w-full');
    expect(screen.getByTestId('preview-area')).toHaveClass('hidden', 'md:block');
  });

  it('en el editor: "Tablets" muestra la tablet achicada y el panel se puede esconder', async () => {
    wideScreen(500, 1124);
    const { user } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Tablets' }));
    expect(await screen.findByText('Tablet · 834 px · al 53%')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Esconder el panel de opciones' });
    await user.click(toggle);
    expect(panel()).toHaveClass('md:hidden');
    expect(screen.getByRole('button', { name: 'Mostrar el panel de opciones' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Un clic en la vista previa lo vuelve a abrir, en el panel de lo tocado.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: EDITOR_MSG.editSection, target: 'footer' },
          origin: storefrontUrl(tenant.subdomain),
        }),
      );
    });
    await waitFor(() => expect(panel()).not.toHaveClass('md:hidden'));
  });
});

/* ---------------- campos ---------------- */

function Harness({
  initial,
  render: r,
}: {
  initial: string;
  render: (v: string, set: (v: string) => void) => ReactNode;
}) {
  const [v, setV] = useState(initial);
  return <>{r(v, setV)}</>;
}

describe('campos del editor', () => {
  it('título: tope de 200 con la cuenta cuando se acerca', () => {
    render(<Harness initial="" render={(v, set) => <TextInput value={v} onChange={set} label="Título" />} />);
    const input = screen.getByRole('textbox', { name: 'Título' });
    expect(input).toHaveAttribute('maxlength', '200');
    expect(screen.queryByText(/\/200$/)).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'a'.repeat(160) } });
    expect(screen.getByText('160/200')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('160/200');
    fireEvent.change(input, { target: { value: 'a'.repeat(200) } });
    expect(input).toHaveAccessibleDescription(/200\/200 Llegaste al máximo de caracteres/);
  });

  it('texto largo: tope de 2000; el tope se puede cambiar o sacar', () => {
    render(
      <>
        <Harness
          initial={'b'.repeat(1700)}
          render={(v, set) => <TextArea value={v} onChange={set} label="Texto" />}
        />
        <TextInput value="" onChange={() => {}} label="Corto" maxLength={50} />
        <TextInput value="" onChange={() => {}} label="Sin tope" maxLength={false} />
        <TextInput value="" onChange={() => {}} label="Link" type="url" />
        <TextInput value="3" onChange={() => {}} label="Número" type="number" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Texto' })).toHaveAttribute('maxlength', '2000');
    expect(screen.getByText('1700/2000')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Corto' })).toHaveAttribute('maxlength', '50');
    expect(screen.getByRole('textbox', { name: 'Sin tope' })).not.toHaveAttribute('maxlength');
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveAttribute('maxlength', '2000');
    expect(screen.getByRole('spinbutton', { name: 'Número' })).not.toHaveAttribute('maxlength');
  });

  it('todo campo tiene nombre: el de Field, el propio, o el del ejemplo', () => {
    render(
      <>
        <Field label="Del Field">
          <TextInput value="" onChange={() => {}} placeholder="ejemplo" />
        </Field>
        <TextInput value="" onChange={() => {}} placeholder="Envíos" />
        <TextArea value="" onChange={() => {}} placeholder="Contá algo" />
        <Select value="a" onChange={() => {}} label="Orden" options={[{ value: 'a', label: 'A' }]} />
      </>,
    );
    // Adentro de un Field no se duplica el nombre.
    expect(screen.getByRole('textbox', { name: 'Del Field' })).toBeInTheDocument();
    expect(screen.getAllByText('Del Field')).toHaveLength(1);
    // Solo con ejemplo: el ejemplo es su nombre (para lectores de pantalla).
    expect(screen.getByRole('textbox', { name: 'Envíos' })).toBeInTheDocument();
    expect(screen.getByText('Envíos')).toHaveClass('sr-only');
    expect(screen.getByRole('textbox', { name: 'Contá algo' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Orden' })).toBeInTheDocument();
    expect(screen.getByText('Orden')).not.toHaveClass('sr-only');
  });
});

/* ---------------- buscador ---------------- */

describe('buscador del editor (Ctrl+K)', () => {
  it('encuentra las opciones nuevas', () => {
    const find = (q: string) => searchOptions(q).map((e) => `${e.view}|${e.label}`);
    expect(find('botones pildora')).toContain('radius|Estilo de los botones');
    expect(find('mega menu')).toContain('header|Subcategorías en el menú (mega-menú)');
    expect(find('agregar categoria menu')).toContain('header|Armar el menú: categorías, productos y links');
    expect(find('fila celular')).toContain('products-list|Productos por fila en el celular');
    expect(find('apilada')).toContain('product-detail|Galería apilada');
    expect(find('links del pie')).toContain('footer|Links del pie');
  });

  it('las secciones del inicio, por su nombre y lo que tienen; los tipos que faltan, para agregar', () => {
    const sections: ThemeSection[] = [
      {
        id: 'faq-1',
        type: 'faq',
        visible: true,
        name: 'Dudas de envío',
        data: { items: [{ question: '¿Hacen retiros en el local?', answer: '' }] },
      },
    ];
    const index = buildOptionIndex(sections);
    expect(searchOptions('dudas', index)[0]).toMatchObject({ view: 'home:faq-1', panel: 'Tu inicio' });
    // Por lo que tiene adentro, y por el tipo.
    expect(searchOptions('retiros local', index)[0]).toMatchObject({ view: 'home:faq-1' });
    expect(searchOptions('preguntas frecuentes', index).map((e) => e.view)).toContain('home:faq-1');
    // El tipo que ya está no se ofrece para agregar; el que falta, sí (lleva a la lista).
    expect(index.some((e) => e.panel === 'Agregar al inicio' && e.label === 'Preguntas frecuentes')).toBe(
      false,
    );
    expect(searchOptions('testimonios', index)[0]).toMatchObject({
      view: 'home',
      panel: 'Agregar al inicio',
    });
  });

  it('elegir una sección abre su panel', async () => {
    const { user } = await openEditor();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Buscar una opción del editor' });
    await user.type(within(dialog).getByRole('searchbox'), 'productos destacados');
    const featured = draft.sections.find((s) => s.type === 'featured')!;
    await user.click(within(dialog).getByRole('button', { name: /^Productos destacados\s*Tu inicio$/ }));
    expect(await within(panel()).findByRole('textbox', { name: 'Nombre de la sección' })).toHaveAttribute(
      'placeholder',
      'Productos destacados',
    );
    expect(featured).toBeTruthy();
  });
});
