/**
 * Las páginas de la tienda con la URL en que se prueban: la lista que recorren
 * el smoke (pages.test) y la exploración (interactions.test).
 */
import type { ReactNode } from 'react';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fixture } from './api';

export type AnyPage = (props: never) => Promise<ReactNode> | ReactNode;

export const product = fixture<{ slug: string; name: string }>('/api/v1/products/by-slug/x');
const productSlug = product.slug;
export const contentPage = fixture<{ slug: string; title: string }>('/api/v1/pages/by-slug/x');
const pageSlug = contentPage.slug;
export const firstListed = fixture<{ items: { name: string }[] }>('/api/v1/products/search').items[0]!.name;

/** Cada página con la URL en que se prueba y cómo se importa. */
export const PAGES: Record<
  string,
  { url: string; params?: Record<string, string>; load: () => Promise<{ default: AnyPage }> }
> = {
  '/': { url: '/', load: () => import('../app/page') },
  '/productos': { url: '/productos?sort=price_asc', load: () => import('../app/productos/page') },
  '/productos/[slug]': {
    url: `/productos/${productSlug}`,
    params: { slug: productSlug },
    load: () => import('../app/productos/[slug]/page'),
  },
  '/paginas/[slug]': {
    url: `/paginas/${pageSlug}`,
    params: { slug: pageSlug },
    load: () => import('../app/paginas/[slug]/page'),
  },
  '/checkout': { url: '/checkout', load: () => import('../app/checkout/page') },
  '/checkout/success': {
    url: '/checkout/success?order=00000000-0000-0000-0000-000000000001',
    load: () => import('../app/checkout/success/page'),
  },
  '/checkout/failure': {
    url: '/checkout/failure?order=00000000-0000-0000-0000-000000000001',
    load: () => import('../app/checkout/failure/page'),
  },
  '/checkout/pending': {
    url: '/checkout/pending?order=00000000-0000-0000-0000-000000000001',
    load: () => import('../app/checkout/pending/page'),
  },
  '/contacto': { url: '/contacto', load: () => import('../app/contacto/page') },
  '/cuenta': { url: '/cuenta', load: () => import('../app/cuenta/page') },
  '/cuenta/reset': { url: '/cuenta/reset?token=abc', load: () => import('../app/cuenta/reset/page') },
  '/cuenta/verificar': {
    url: '/cuenta/verificar?token=abc',
    load: () => import('../app/cuenta/verificar/page'),
  },
  '/favoritos': { url: '/favoritos', load: () => import('../app/favoritos/page') },
  '/arrepentimiento': { url: '/arrepentimiento', load: () => import('../app/arrepentimiento/page') },
  '/privacidad': { url: '/privacidad', load: () => import('../app/privacidad/page') },
  '/terminos': { url: '/terminos', load: () => import('../app/terminos/page') },
  '/preview': { url: '/preview?pt=token', load: () => import('../app/preview/page') },
};

/** Las páginas que existen en app/ (carpetas con page.tsx). */
export function discoveredPages(dir = path.resolve(__dirname, '../app'), base = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...discoveredPages(full, `${base}/${entry}`));
    else if (entry === 'page.tsx') found.push(base || '/');
  }
  return found;
}
