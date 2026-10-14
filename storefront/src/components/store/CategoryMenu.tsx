'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { useHoverMenu } from './useHoverMenu';
import { useCart } from './cart';
import { usePreviewHref } from './preview';
import { StoreLink } from './StoreLink';

import { clientJsonTenant } from '@/lib/api-client';
import { categoryHref } from '@/lib/category-url';

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

/** Fila recursiva: link + flechita para expandir hijos. Misma UX en todo lado. */
function CatRow({ node, depth, onNavigate }: { node: CatNode; depth: number; onNavigate: () => void }) {
  const href = usePreviewHref();
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 0.75}rem` }}>
        <Link
          href={href(categoryHref(node))}
          onClick={onNavigate}
          className={`flex-1 py-1.5 text-sm hover:text-primary-ink ${depth === 0 ? 'font-semibold' : 'opacity-80 hover:opacity-100'}`}
        >
          {node.name}
        </Link>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Contraer' : 'Expandir'}
            className="shrink-0 rounded p-1 opacity-70 hover:opacity-100"
          >
            <Icon name="chevronRight" className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
      {/* Las subcategorías van siempre en el HTML (ocultas hasta expandir): sus links llegan a Google. */}
      {hasChildren && (
        <ul hidden={!open}>
          {node.children.map((ch) => (
            <CatRow key={ch.id} node={ch} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Lista-árbol de categorías (acordeón). La usan el dropdown desktop y el panel mobile. */
function CategoryTree({ nodes, onNavigate }: { nodes: CatNode[]; onNavigate: () => void }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) => (
        <CatRow key={n.id} node={n} depth={0} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}

/** Desktop: botón "Categorías" con dropdown acordeón. */
export function CategoryMenu({ label = 'Categorías' }: { label?: string }) {
  const tree = useCategoryTree();
  const { open, close, container, trigger, panel } = useHoverMenu();

  if (tree.length === 0) return null;

  return (
    <div className="relative shrink-0" {...container}>
      <button
        type="button"
        {...trigger}
        className="flex items-center gap-1 whitespace-nowrap opacity-90 hover:opacity-100"
      >
        {label}{' '}
        <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Siempre en el HTML, oculto hasta abrir: los links a las categorías tienen
          que estar en lo que manda el servidor para que Google los encuentre.
          `pt-2`: puente transparente para no perder el hover al bajar el mouse. */}
      <div className="absolute left-0 top-full z-50 pt-2" {...panel}>
        <div className="max-h-[75vh] w-64 overflow-y-auto rounded-lg border border-black/10 bg-bg p-3 text-fg shadow-xl">
          <CategoryTree nodes={tree} onNavigate={close} />
        </div>
      </div>
    </div>
  );
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

/** Un link que el comercio anidó a mano debajo de un ítem del menú. */
interface ExtraLink {
  id: string;
  label: string;
  href: string;
  newTab?: boolean;
}

/**
 * Desktop: una categoría del menú armable con "mostrar subcategorías". Abre un
 * mega-menú a lo ancho del menú: cada subcategoría es una columna con sus
 * hijas debajo. Sin subcategorías (ni ítems anidados) es un link común.
 *
 * El contenedor no es `relative` a propósito: el panel se posiciona contra el
 * <nav>, así ocupa todo el ancho del menú y no solo el del botón.
 */
export function CategoryMegaMenu({
  categoryId,
  label,
  href,
  extra = [],
}: {
  categoryId: string;
  label: string;
  href: string;
  /** Ítems anidados a mano debajo de la categoría: van en su propia columna. */
  extra?: ExtraLink[];
}) {
  const tree = useCategoryTree();
  const toHref = usePreviewHref();
  const { open, close, container, trigger, panel } = useHoverMenu();
  const columns = findCategoryNode(tree, categoryId)?.children ?? [];

  if (columns.length === 0 && extra.length === 0)
    return (
      <StoreLink href={href} className="shrink-0 opacity-90 hover:opacity-100">
        {label}
      </StoreLink>
    );

  return (
    <div className="shrink-0" {...container}>
      <button
        type="button"
        {...trigger}
        className="flex items-center gap-1 whitespace-nowrap opacity-90 hover:opacity-100"
      >
        {label}
        <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="absolute inset-x-0 top-full z-50 pt-2" {...panel}>
        <div className="max-h-[75vh] overflow-y-auto whitespace-normal rounded-lg border border-black/10 bg-bg p-5 text-left text-fg shadow-xl">
          <StoreLink
            href={href}
            onClick={close}
            className="mb-4 inline-block text-sm font-semibold text-primary-ink hover:underline"
          >
            Ver todo {label}
          </StoreLink>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-6 gap-y-5">
            {columns.map((col) => (
              <div key={col.id}>
                <Link
                  href={toHref(categoryHref(col))}
                  onClick={close}
                  className="block py-1 text-sm font-semibold hover:text-primary-ink"
                >
                  {col.name}
                </Link>
                {col.children.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {col.children.map((leaf) => (
                      <li key={leaf.id}>
                        <Link
                          href={toHref(categoryHref(leaf))}
                          onClick={close}
                          className="block py-1 text-sm opacity-80 hover:text-primary-ink hover:opacity-100"
                        >
                          {leaf.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {extra.length > 0 && (
              <ul className="space-y-0.5">
                {extra.map((x) => (
                  <li key={x.id}>
                    <StoreLink
                      href={x.href}
                      newTab={x.newTab}
                      onClick={close}
                      className="block py-1 text-sm font-semibold hover:text-primary-ink"
                    >
                      {x.label}
                    </StoreLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mobile: mismo árbol acordeón, inline dentro del panel desplegable. */
export function CategoryMenuMobile({
  onNavigate,
  label = 'Categorías',
}: {
  onNavigate: () => void;
  label?: string;
}) {
  const tree = useCategoryTree();
  if (tree.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-0 py-1.5 text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</div>
      <CategoryTree nodes={tree} onNavigate={onNavigate} />
    </div>
  );
}

/** Mobile: las subcategorías de una categoría del menú armable, como árbol acordeón. */
export function CategoryBranchMobile({
  categoryId,
  onNavigate,
}: {
  categoryId: string;
  onNavigate: () => void;
}) {
  const tree = useCategoryTree();
  const children = findCategoryNode(tree, categoryId)?.children ?? [];
  if (children.length === 0) return null;
  return <CategoryTree nodes={children} onNavigate={onNavigate} />;
}

/** ¿La categoría tiene subcategorías? (decide si en el celular es acordeón o link). */
export function useHasSubcategories(categoryId: string | undefined): boolean {
  const tree = useCategoryTree();
  if (!categoryId) return false;
  return (findCategoryNode(tree, categoryId)?.children.length ?? 0) > 0;
}
