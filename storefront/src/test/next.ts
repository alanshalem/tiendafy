/**
 * El "Next" de los tests: dónde está parado el router (path, query), a qué
 * host llegó el request (define la tienda) y qué navegaciones pidió la página.
 * Los mocks de next/navigation y next/headers (setup.ts) leen de acá.
 */
import { vi } from 'vitest';

function freshRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  };
}

export const nav = {
  pathname: '/',
  search: '',
  host: 'seed.localhost:3000',
  router: freshRouter(),
  /** Para el próximo render: path (con query opcional) y host. */
  at(path: string, host = 'seed.localhost:3000') {
    const [pathname, search = ''] = path.split('?');
    this.pathname = pathname || '/';
    this.search = search;
    this.host = host;
  },
  reset() {
    this.at('/');
    this.router = freshRouter();
  },
};
