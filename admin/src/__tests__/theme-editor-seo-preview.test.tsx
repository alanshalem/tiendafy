/**
 * "Cómo aparecés en Google" y el link en WhatsApp, en el panel de identidad:
 * la vista previa usa los mismos textos por defecto que la tienda, corta
 * como corta Google, y el contador avisa cuando el largo no sirve.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  homeSeoDescription,
  homeSeoTitle,
  homeShareImage,
  normalizeTheme,
  SEO_TITLE_IDEAL,
  truncateForSnippet,
  type ThemeConfig,
} from '@tiendafy/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogoPanel } from '../pages/theme-editor/LogoPanel';
import { mockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

let current: ThemeConfig;

function Harness({ initial }: { initial: ThemeConfig }) {
  const [theme, setTheme] = useState(initial);
  return (
    <LogoPanel
      theme={theme}
      storeName="Volxen"
      onBack={() => {}}
      updateTheme={(u) => setTheme((t) => (current = u(t)))}
    />
  );
}

async function show(initial: Partial<ThemeConfig> = {}) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  current = normalizeTheme(initial);
  renderWithProviders(<Harness initial={current} />);
  await settle(4);
  return user;
}

const google = () => within(screen.getByRole('figure', { name: 'Vista previa en Google' }));
const whatsapp = () => within(screen.getByRole('figure', { name: 'Vista previa al compartir por WhatsApp' }));

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
});
afterEach(() => expect(crashes()).toEqual([]));

describe('textos de la portada para Google', () => {
  it('vacíos, los mismos que pone la tienda', () => {
    expect(homeSeoTitle('  ', 'Volxen')).toBe('Volxen — Tienda online');
    expect(homeSeoTitle(' Ropa de gimnasio ', 'Volxen')).toBe('Ropa de gimnasio');
    expect(homeSeoDescription(undefined, 'Volxen')).toMatch(/^Comprá online en Volxen\./);
  });

  it('la imagen al compartir: la propia, si no el logo (nunca un SVG)', () => {
    expect(homeShareImage(' https://x/og.jpg ', 'https://x/logo.png')).toEqual({
      url: 'https://x/og.jpg',
      fromLogo: false,
    });
    expect(homeShareImage('', 'https://x/logo.png')).toEqual({ url: 'https://x/logo.png', fromLogo: true });
    expect(homeShareImage('', 'https://x/logo.SVG?v=2')).toBeNull();
    expect(homeShareImage(null, '')).toBeNull();
  });

  it('se cortan en una palabra, con "…", como los corta Google', () => {
    expect(truncateForSnippet('corto', 60)).toBe('corto');
    const cut = truncateForSnippet(
      'Volxen equipamiento para gimnasios hogareños y profesionales de todo el país',
      40,
    );
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut).toMatch(/\p{L}…$/u);
    expect(cut).not.toMatch(/\s…$/);
  });
});

describe('vista previa en el panel de identidad', () => {
  it('sin textos propios muestra los de la tienda, con el dominio y sin favicon', async () => {
    await show();
    expect(google().getByText('Volxen — Tienda online')).toBeInTheDocument();
    expect(google().getByText(/^Comprá online en Volxen/)).toBeInTheDocument();
    expect(google().getByText(/^https:\/\//)).toBeInTheDocument();
    expect(screen.getAllByText('Vacío: va el de la vista previa.')).toHaveLength(2);
  });

  it('se actualiza mientras se escribe y avisa por el largo', async () => {
    const user = await show();
    const title = screen.getByLabelText('Título para buscadores');
    await user.type(title, 'Volxen');
    expect(current.seoTitle).toBe('Volxen');
    // El nombre del sitio y el título.
    expect(google().getAllByText('Volxen')).toHaveLength(2);
    expect(screen.getByText('Corto: sumá qué vendés.')).toBeInTheDocument();

    await user.type(title, ' — Ropa y accesorios de gimnasio');
    expect(screen.getByText('Buen largo.')).toBeInTheDocument();

    await user.type(title, ' para entrenar en casa con envíos a todo el país');
    expect(screen.getByText('Largo: Google lo va a cortar.')).toBeInTheDocument();
    // Como en el celular: el título entero, hasta dos renglones (el resto lo corta el ancho).
    const shown = google().getByText(/^Volxen — Ropa/);
    expect(shown.textContent).toBe(current.seoTitle);
    expect(shown).toHaveClass('line-clamp-2');
    expect(screen.getByText(`${current.seoTitle.length} de ${SEO_TITLE_IDEAL}`)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Descripción para buscadores'), 'Pesas y bancos.');
    expect(screen.getByText(/^Corta: contá qué vendés/)).toBeInTheDocument();
    expect(whatsapp().getByText('Pesas y bancos.')).toBeInTheDocument();
  });

  it('el favicon y la imagen al compartir aparecen en sus vistas previas', async () => {
    await show({ favicon: 'https://cdn.test/fav.png', shareImage: 'https://cdn.test/og.jpg' });
    expect(
      screen.getByRole('figure', { name: 'Vista previa en Google' }).querySelector('img'),
    ).toHaveAttribute('src', 'https://cdn.test/fav.png');
    expect(
      screen.getByRole('figure', { name: 'Vista previa al compartir por WhatsApp' }).querySelector('img'),
    ).toHaveAttribute('src', 'https://cdn.test/og.jpg');
    expect(screen.queryByText(/Sin imagen, el link sale chico/)).not.toBeInTheDocument();
  });

  it('sin imagen al compartir va el logo en chico; sin logo (o SVG), solo el texto', async () => {
    await show({ logo: 'https://cdn.test/logo.png' });
    expect(
      screen.getByRole('figure', { name: 'Vista previa al compartir por WhatsApp' }).querySelector('img'),
    ).toHaveAttribute('src', 'https://cdn.test/logo.png');
    expect(screen.getByText(/va tu logo en chico/)).toBeInTheDocument();
  });

  it('sin imagen ni logo, la tarjeta es solo texto y sugiere subir una', async () => {
    await show({ logo: 'https://cdn.test/logo.svg' });
    expect(whatsapp().getByText('Volxen — Tienda online')).toBeInTheDocument();
    expect(
      screen.getByRole('figure', { name: 'Vista previa al compartir por WhatsApp' }).querySelector('img'),
    ).toBeNull();
    expect(screen.getByText(/Sin imagen, el link sale chico/)).toBeInTheDocument();
  });
});
