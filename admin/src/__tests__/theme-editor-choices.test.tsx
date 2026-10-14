/**
 * Los selectores visuales del editor de secciones (forma, lado, columnas…
 * con un dibujito en vez de una lista) y los ajustes que salieron de probar
 * cada opción en el navegador: alineación que no hacía nada, avisos que no
 * correspondían en una tienda oscura y el destino de "Ver todos".
 */
import { baseTheme, type SectionType, type ThemeConfig, type ThemeSection } from '@tiendafy/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceGroup, RatioIcon } from '../pages/theme-editor/sections/choice-group';
import { SectionPanel } from '../pages/theme-editor/sections/SectionPanel';
import { mockApi } from '../test/api';
import { radio } from '../test/choice';
import { settle } from '../test/explore';
import { renderWithProviders } from '../test/render';

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

describe('ChoiceGroup', () => {
  function Demo({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState('16x9');
    return (
      <ChoiceGroup
        label="Forma"
        hint="Cambia la medida recomendada."
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        options={[
          { value: '16x9', label: '16:9', title: 'Apaisada (16:9)', icon: <RatioIcon ratio="16x9" /> },
          { value: '1x1', label: '1:1', title: 'Cuadrada (1:1)', icon: <RatioIcon ratio="1x1" /> },
        ]}
      />
    );
  }

  it('es un grupo de radios con nombre: se ve qué está elegido y se cambia tocando', async () => {
    const onChange = vi.fn();
    const u = user();
    render(<Demo onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Forma' });
    expect(group).toHaveAccessibleDescription('Cambia la medida recomendada.');
    expect(radio('Forma', 'Apaisada (16:9)')).toBeChecked();
    await u.click(radio('Forma', 'Cuadrada (1:1)'));
    expect(onChange).toHaveBeenLastCalledWith('1x1');
    expect(radio('Forma', 'Cuadrada (1:1)')).toBeChecked();
    // Con el teclado: flecha a la opción de al lado.
    await u.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('16x9');
  });

  it('cada opción se toca en 40 px o más', () => {
    render(<Demo onChange={() => {}} />);
    expect(radio('Forma', 'Cuadrada (1:1)').closest('label')).toHaveClass('min-h-10');
  });

  it('el dibujo de la proporción respeta ancho y alto', () => {
    const { container } = render(
      <>
        <RatioIcon ratio="9:16" />
        <RatioIcon ratio="3x1" />
      </>,
    );
    const [tall, wide] = Array.from(container.querySelectorAll('rect'));
    expect(Number(tall!.getAttribute('height'))).toBeGreaterThan(Number(tall!.getAttribute('width')));
    expect(Number(wide!.getAttribute('width'))).toBeCloseTo(Number(wide!.getAttribute('height')) * 3);
  });
});

function Harness({
  type,
  data = {},
  theme,
  onData = () => {},
}: {
  type: SectionType;
  data?: Record<string, unknown>;
  theme?: ThemeConfig;
  onData?: (d: Record<string, unknown>) => void;
}) {
  const [section, setSection] = useState<ThemeSection>({ id: 's1', type, visible: true, data });
  return (
    <SectionPanel
      section={section}
      theme={theme}
      onBack={() => {}}
      onChange={(next) => {
        setSection(next);
        onData(next.data);
      }}
    />
  );
}

describe('Diseño de la sección', () => {
  it.each(['carousel', 'info-bar', 'hero-video', 'promo-popup'] as const)(
    '%s: sin "Alineación de los títulos" (no tiene título que alinear)',
    async (type) => {
      mockApi();
      const u = user();
      renderWithProviders(<Harness type={type} />);
      await settle(2);
      await u.click(screen.getByRole('button', { name: 'Diseño de la sección' }));
      expect(screen.getByRole('radiogroup', { name: 'Fondo' })).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'Alineación de los títulos' })).not.toBeInTheDocument();
    },
  );

  it('las que tienen título sí la ofrecen', async () => {
    mockApi();
    const u = user();
    renderWithProviders(<Harness type="faq" />);
    await settle(2);
    await u.click(screen.getByRole('button', { name: 'Diseño de la sección' }));
    expect(screen.getByRole('radiogroup', { name: 'Alineación de los títulos' })).toBeInTheDocument();
  });
});

describe('imagen y texto en una tienda oscura', () => {
  const dark: ThemeConfig = {
    ...baseTheme,
    colors: { ...baseTheme.colors, bg: '14 15 18', text: '244 245 247' },
  };

  it('texto claro no avisa de un recuadro oscuro: la tienda ya es oscura', async () => {
    mockApi();
    const u = user();
    renderWithProviders(<Harness type="image-text" data={{ title: 'T', image: '' }} theme={dark} />);
    await settle(2);
    await u.selectOptions(screen.getByLabelText('Color del texto'), 'light');
    expect(screen.queryByText(/le pone un recuadro oscuro/)).not.toBeInTheDocument();
  });

  it('las opciones de lugar de la imagen están aunque todavía no haya foto', async () => {
    mockApi();
    renderWithProviders(<Harness type="image-text" data={{ title: 'T', image: '' }} />);
    await settle(2);
    expect(screen.getByRole('radiogroup', { name: 'Imagen en computadora' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'En celular va primero' })).toBeInTheDocument();
  });
});

describe('"Ver todos" de una sección de productos', () => {
  it.each([
    [{ kind: 'on-sale' }, 'va al listado de los productos en oferta (/productos?onSale=1)'],
    [{ kind: 'best-sellers' }, 'va al listado, con lo más vendido primero (/productos?sort=best_sellers)'],
    [{ kind: 'manual', ids: [] }, 'va al listado de todos los productos (/productos)'],
    [{ kind: 'newest' }, 'va al listado, con lo más nuevo primero (/productos?sort=newest)'],
  ])('%o: el destino automático se dice como es', async (source, text) => {
    mockApi();
    renderWithProviders(<Harness type="featured" data={{ viewAll: true, source }} />);
    await settle(2);
    expect(screen.getByText(new RegExp(text.replace(/[()?/]/g, '\\$&')))).toBeInTheDocument();
  });

  it('"Auto" en columnas dice cuántas usa (las del listado de productos)', async () => {
    mockApi();
    const theme: ThemeConfig = { ...baseTheme, productList: { ...baseTheme.productList, columns: 3 } };
    renderWithProviders(<Harness type="featured" theme={theme} />);
    await settle(2);
    expect(screen.getByText('«Auto» usa las del listado de productos (3 por fila).')).toBeInTheDocument();
  });
});
