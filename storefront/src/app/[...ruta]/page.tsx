import type { Metadata } from 'next';
import { notFoundUnlessRedirected } from '@/lib/redirects';
import { NOT_INDEXED } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/**
 * El título del 404 de una URL que no es de ninguna página. La metadata de
 * not-found.tsx no llega acá (la página existe: es esta), y sin esto la
 * pestaña y Google veían solo el nombre de la tienda. La plantilla del
 * layout le suma " · Tienda".
 */
export const metadata: Metadata = { title: 'Página no encontrada', robots: NOT_INDEXED };

/**
 * Toda URL que no es de ninguna página de la tienda cae acá (las rutas
 * concretas le ganan a esta). Es el único lugar, junto con producto y página
 * de contenido, donde vale la pena preguntar si el comercio dejó una
 * redirección: un link viejo, una página que se movió.
 */
export default async function Unmatched(): Promise<never> {
  return notFoundUnlessRedirected();
}
