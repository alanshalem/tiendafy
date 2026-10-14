/**
 * Entorno de los tests de componentes del storefront: matchers del DOM,
 * limpieza entre tests, polyfills de jsdom (compartidos con el admin) y lo que
 * Next pone en runtime y en un test no existe: el router, Link, Image, Script
 * y los headers del request (el host define la tienda).
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, vi } from 'vitest';
import { installDomPolyfills } from '../../../test-fixtures/dom-setup';
import { nav } from './next';

installDomPolyfills();

// jsdom no reproduce video: play() avisa "not implemented" en cada test del hero.
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  nav.reset();
});

vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({}),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  permanentRedirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _p,
    scroll: _s,
    ...rest
  }: Record<string, unknown> & { href: unknown; children?: ReactNode }) =>
    createElement(
      'a',
      {
        href: typeof href === 'string' ? href : String((href as { pathname?: string })?.pathname ?? ''),
        ...rest,
      },
      children,
    ),
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _f,
    priority: _p,
    preload: _pl,
    sizes: _s,
    ...rest
  }: Record<string, unknown>) =>
    createElement('img', {
      src: typeof src === 'string' ? src : '',
      alt: String(alt ?? ''),
      ...rest,
      // Como next/image: lazy salvo que se pida otra cosa o vaya con prioridad.
      loading: rest.loading ?? (_pl || _p ? undefined : 'lazy'),
    }),
  // Para <picture> (foto distinta en celular): las props de la <img>, con un
  // srcSet que dice de qué foto es, así el test ve qué fuente va en cada media.
  getImageProps: ({ src, alt, sizes, fill: _f, width, height, ...rest }: Record<string, unknown>) => ({
    props: {
      src: typeof src === 'string' ? src : '',
      srcSet: `${String(src)} 1x`,
      sizes,
      alt: String(alt ?? ''),
      width,
      height,
      ...rest,
    },
  }),
}));

vi.mock('next/script', () => ({ default: () => null }));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ ...nav.headers, host: nav.host }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
}));
