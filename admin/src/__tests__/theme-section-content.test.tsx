/**
 * Los editores de las secciones de contenido de la portada (productos,
 * preguntas, barra de información, video, testimonios, newsletter e
 * institucional): cada opción nueva llega a los datos de la sección, todos
 * los campos tienen su etiqueta y lo que antes se perdía ya no se pierde.
 */
import { baseTheme, type SectionType, type ThemeConfig, type ThemeSection } from '@tiendafy/types';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionPanel } from '../pages/theme-editor/sections/SectionPanel';
import { mockApi } from '../test/api';
import { renderWithProviders } from '../test/render';

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

let last: Record<string, unknown> = {};

function Harness({
  type,
  data = {},
  theme,
}: {
  type: SectionType;
  data?: Record<string, unknown>;
  theme?: ThemeConfig;
}) {
  const [section, setSection] = useState<ThemeSection>({ id: 's1', type, visible: true, data });
  return (
    <div data-testid="panel">
      <SectionPanel
        section={section}
        theme={theme}
        onBack={() => {}}
        onChange={(next) => {
          setSection(next);
          last = next.data;
        }}
      />
    </div>
  );
}

async function mount(type: SectionType, data?: Record<string, unknown>, theme?: ThemeConfig) {
  last = {};
  renderWithProviders(<Harness type={type} data={data} theme={theme} />);
  await waitFor(() => expect(screen.getByLabelText('Nombre de la sección')).toBeInTheDocument());
}

beforeEach(() => {
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

/** Todo campo del editor tiene un nombre (label, aria-label o aria-labelledby). */
function unlabelled(): string[] {
  const fields = screen
    .getByTestId('panel')
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type=hidden]):not([type=file]), select, textarea',
    );
  return [...fields]
    .filter(
      (el) =>
        !el.classList.contains('hidden') &&
        !(el.labels && el.labels.length > 0) &&
        !el.getAttribute('aria-label') &&
        !el.getAttribute('aria-labelledby'),
    )
    .map((el) => el.outerHTML.slice(0, 120));
}

describe('todos los campos tienen etiqueta', () => {
  const ONE_ITEM: Partial<Record<SectionType, Record<string, unknown>>> = {
    faq: { items: [{ question: 'P', answer: 'R' }] },
    'info-bar': { items: [{ icon: 'card', title: 'T' }] },
    testimonials: { items: [{ quote: 'Q', name: 'N' }] },
  };
  it.each(['faq', 'info-bar', 'instagram', 'testimonials', 'newsletter', 'institutional'] as SectionType[])(
    '%s',
    async (type) => {
      await mount(type, ONE_ITEM[type] ?? {});
      // Una lista de un solo ítem arranca abierta: sus campos también cuentan.
      expect(unlabelled()).toEqual([]);
    },
  );
});

describe('preguntas frecuentes', () => {
  it('abrir la primera y el aviso de una pregunta sin respuesta', async () => {
    const u = user();
    await mount('faq', { items: [{ question: 'Sin respuesta', answer: '' }] });
    expect(screen.getByText(/Sin pregunta y respuesta no se muestra/)).toBeInTheDocument();
    await u.click(screen.getByLabelText('Mostrar la primera pregunta abierta'));
    expect(last.openFirst).toBe(true);
  });
});

describe('barra de información', () => {
  it('sin ítems: cambiar un ícono guarda los tres de siempre, con sus títulos', async () => {
    const u = user();
    await mount('info-bar');
    // Los ítems se llaman por su título, no "Banner N".
    await u.click(screen.getByRole('button', { name: 'Envíos a todo el país' }));
    await u.selectOptions(screen.getByLabelText('Ícono'), 'gift');
    const items = last.items as { icon: string; title: string }[];
    expect(items.map((i) => i.title)).toEqual([
      'Envíos a todo el país',
      'Pagá con Mercado Pago',
      'Compra protegida',
    ]);
    expect(items[0]!.icon).toBe('gift');
  });

  it('un ítem sin título se nombra por su ícono; cómo se acomoda en el celular', async () => {
    const u = user();
    await mount('info-bar', {
      items: [
        { icon: 'returns', title: '' },
        { icon: 'card', title: 'Cuotas' },
      ],
    });
    expect(screen.getByRole('button', { name: 'Cambios' })).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('En el celular'), 'carousel');
    expect(last.mobileLayout).toBe('carousel');
  });
});

describe('Instagram / video', () => {
  it('avisa si el link no se puede mostrar y dice qué es si se puede', async () => {
    const u = user();
    await mount('instagram');
    const input = screen.getByLabelText('Link del video o la publicación');
    await u.type(input, 'https://otra-pagina.com/x');
    expect(screen.getByRole('alert')).toHaveTextContent('no se puede mostrar');
    await u.clear(input);
    await u.type(input, 'https://youtube.com/shorts/dQw4w9WgXcQ');
    expect(screen.getByRole('status')).toHaveTextContent('Short de YouTube');
    await u.selectOptions(screen.getByLabelText('Proporción del video'), '1:1');
    expect(last.aspect).toBe('1:1');
  });
});

describe('newsletter', () => {
  it('avisa si el pie ya tiene su formulario', async () => {
    const withFooter = { ...baseTheme, footer: { ...baseTheme.footer, showNewsletter: true } };
    await mount('newsletter', {}, withFooter);
    expect(screen.getByRole('note')).toHaveTextContent('El pie de página ya tiene su formulario');
  });

  it('sin newsletter en el pie no avisa; mensaje, letra chica y diseño llegan a los datos', async () => {
    const u = user();
    await mount('newsletter', {}, baseTheme);
    expect(screen.queryByRole('note')).toBeNull();
    await u.type(screen.getByLabelText('Mensaje al suscribirse'), 'Gracias');
    await u.type(screen.getByLabelText('Letra chica (opcional)'), 'Baja cuando quieras');
    await u.selectOptions(screen.getByLabelText('Cómo se acomoda'), 'split');
    expect(last).toMatchObject({
      successMessage: 'Gracias',
      legalText: 'Baja cuando quieras',
      layout: 'split',
    });
  });
});

describe('testimonios', () => {
  it('estrellas y carrusel', async () => {
    const u = user();
    await mount('testimonials', { items: [{ quote: 'Muy bueno', name: 'Ana' }] });
    await u.selectOptions(screen.getByLabelText('Estrellas'), '5');
    expect((last.items as { rating: string }[])[0]!.rating).toBe('5');
    await u.selectOptions(screen.getByLabelText('Cómo se muestran'), 'carousel');
    expect(last.layout).toBe('carousel');
  });
});

describe('institucional', () => {
  it('el botón: avisa si le falta el link', async () => {
    const u = user();
    await mount('institutional', { title: 'Nosotros' });
    await u.type(screen.getByLabelText('Texto del botón (opcional)'), 'Conocenos');
    expect(last.buttonText).toBe('Conocenos');
    expect(screen.getByText('El botón se muestra cuando tiene texto y link.')).toBeInTheDocument();
  });
});
