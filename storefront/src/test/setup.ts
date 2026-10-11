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
  default: ({ src, alt, fill: _f, priority: _p, sizes: _s, ...rest }: Record<string, unknown>) =>
    createElement('img', { src: typeof src === 'string' ? src : '', alt: String(alt ?? ''), ...rest }),
}));

vi.mock('next/script', () => ({ default: () => null }));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ ...nav.headers, host: nav.host }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
}));
