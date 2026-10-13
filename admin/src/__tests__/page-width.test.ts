/**
 * Todas las pantallas del panel usan el mismo ancho: el del marco
 * (PAGE_MAIN en lib/styles). Antes cada página se encerraba en el suyo
 * (max-w-2xl, 3xl, 4xl, 5xl, 6xl…) y al pasar de una a otra el contenido
 * saltaba de lugar y desperdiciaba media pantalla.
 *
 * Angosto sigue estando bien para lo que no es una página: un modal, el
 * login, un párrafo largo. Eso no centra un bloque con `mx-auto`, que es lo
 * que delata a un contenedor de página.
 */
import { describe, expect, it } from 'vitest';

/** Las excepciones, con su motivo. */
const ALLOWED: Record<string, string> = {
  '../pages/Help.tsx': 'el centro de ayuda es texto para leer y tiene su propio marco',
  '../components/EmptyState.tsx': 'el "todavía no hay nada" va centrado, no es el contenido de la página',
};

const PAGE_CONTAINER = /className="[^"]*\bmx-auto\b[^"]*\bmax-w-(?:2xl|3xl|4xl|5xl|6xl|7xl)\b[^"]*"/;

describe('ancho de las páginas', () => {
  it('ninguna página se encierra en un ancho propio', () => {
    const sources = import.meta.glob<string>(['../pages/**/*.tsx', '../components/**/*.tsx'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const boxed = Object.entries(sources)
      .filter(([path, code]) => !(path in ALLOWED) && PAGE_CONTAINER.test(code))
      .map(([path, code]) => `${path}: ${code.match(PAGE_CONTAINER)![0]}`);
    expect(boxed).toEqual([]);
  });
});
