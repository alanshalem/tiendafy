/**
 * Entorno de los tests de componentes: matchers del DOM, limpieza entre tests
 * y lo que jsdom no trae y el panel usa (matchMedia para el modo oscuro,
 * observers de los gráficos y del scroll, URLs de objetos para descargas).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  window.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView ??= () => {};
  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
}
