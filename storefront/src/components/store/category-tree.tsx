'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCart } from './cart-context';
import { clientJsonTenant } from '@/lib/api-client';

/*
 * El árbol de categorías de la tienda, aparte de los menús que lo dibujan
 * (CategoryMenu): el proveedor va en el layout raíz, en TODAS las páginas
 * —la de "en construcción" incluida— y no tiene por qué arrastrar los menús.
 */

export interface Cat {
  id: string;
  name: string;
  parentId: string | null;
  path?: string;
}

/**
 * Las categorías que trajo el servidor (ver StoreCategories, en el layout).
 * Antes el menú las pedía desde el navegador después de cargar, así que no
 * estaban en el HTML: Google no veía ningún link a una categoría. null = no
 * vinieron del servidor (tests, o la API falló): se piden como antes.
 */
const StoreCategoriesContext = createContext<Cat[] | null>(null);

export function StoreCategoriesProvider({
  categories,
  children,
}: {
  categories: Cat[];
  children: ReactNode;
}) {
  return <StoreCategoriesContext.Provider value={categories}>{children}</StoreCategoriesContext.Provider>;
}
export interface CatNode extends Cat {
  children: CatNode[];
}

/** Arma el árbol (cualquier profundidad) desde la lista plana con parentId. */
function buildTree(cats: Cat[]): CatNode[] {
  const byId = new Map<string, CatNode>();
  cats.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: CatNode[] = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

/** Las categorías de la tienda como árbol. Compartido desktop + mobile (y el menú armable). */
export function useCategoryTree(): CatNode[] {
  const fromServer = useContext(StoreCategoriesContext);
  const { tenantId } = useCart();
  const [fetched, setFetched] = useState<Cat[]>([]);
  useEffect(() => {
    if (fromServer || !tenantId) return;
    clientJsonTenant<{ items?: Cat[] }>('/api/v1/categories', tenantId).then((d) =>
      setFetched(d?.items ?? []),
    );
  }, [fromServer, tenantId]);
  const cats = fromServer ?? fetched;
  return useMemo(() => buildTree(cats), [cats]);
}

/** Una categoría del árbol por id (en cualquier profundidad). */
export function findCategoryNode(nodes: CatNode[], id: string): CatNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = findCategoryNode(n.children, id);
    if (inner) return inner;
  }
  return undefined;
}

/** ¿La categoría tiene subcategorías? (decide si en el celular es acordeón o link). */
export function useHasSubcategories(categoryId: string | undefined): boolean {
  const tree = useCategoryTree();
  if (!categoryId) return false;
  return (findCategoryNode(tree, categoryId)?.children.length ?? 0) > 0;
}
