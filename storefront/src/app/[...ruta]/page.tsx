import { notFoundUnlessRedirected } from '@/lib/redirects';

export const dynamic = 'force-dynamic';

/**
 * Toda URL que no es de ninguna página de la tienda cae acá (las rutas
 * concretas le ganan a esta). Es el único lugar, junto con producto y página
 * de contenido, donde vale la pena preguntar si el comercio dejó una
 * redirección: un link viejo, una página que se movió.
 */
export default async function Unmatched(): Promise<never> {
  return notFoundUnlessRedirected();
}
