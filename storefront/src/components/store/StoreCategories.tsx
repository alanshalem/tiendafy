import type { ReactNode } from 'react';
import { fetchCategories } from '@/lib/catalog';
import { resolveTenant } from '@/lib/tenancy';
import { StoreCategoriesProvider } from './category-tree';

/**
 * Las categorías de la tienda, traídas en el servidor para el menú del
 * encabezado (ver StoreCategoriesProvider). Va en el layout raíz y no en
 * cada página: así llega a todas sin tocar cada una. Sale de la Data Cache
 * (un minuto, por tienda), como la tienda misma.
 *
 * Si no hay tienda o la API falla, no provee nada y el menú las pide desde
 * el navegador, como antes: el menú nunca puede tumbar la página.
 */
export async function StoreCategories({ children }: { children: ReactNode }) {
  const tenant = await resolveTenant().catch(() => null);
  const categories = tenant ? await fetchCategories(tenant.id).catch(() => null) : null;
  if (!categories) return <>{children}</>;
  return (
    <StoreCategoriesProvider
      categories={categories.map(({ id, name, parentId, path }) => ({ id, name, parentId, path }))}
    >
      {children}
    </StoreCategoriesProvider>
  );
}
