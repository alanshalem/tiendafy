'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { useCart } from './cart';
import { usePreviewHref } from './preview';

import { clientJson } from '@/lib/api-client';

interface Cat {
  id: string;
  name: string;
  parentId: string | null;
}
interface CatNode extends Cat {
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

/** Carga las categorías de la tienda como árbol. Compartido desktop + mobile. */
function useCategoryTree(): CatNode[] {
  const { tenantId } = useCart();
  const [cats, setCats] = useState<Cat[]>([]);
  useEffect(() => {
    if (!tenantId) return;
    clientJson<{ items?: Cat[] }>('/api/v1/categories', { headers: { 'X-Tenant-Id': tenantId } }).then((d) =>
      setCats(d?.items ?? []),
    );
  }, [tenantId]);
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
          href={href(`/productos?category=${node.id}`)}
          onClick={onNavigate}
          className={`flex-1 py-1.5 text-sm hover:text-primary ${depth === 0 ? 'font-semibold' : 'opacity-80 hover:opacity-100'}`}
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
      {hasChildren && open && (
        <ul>
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
export function CategoryMenu() {
  const tree = useCategoryTree();
  const [open, setOpen] = useState(false);

  if (tree.length === 0) return null;

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 opacity-90 hover:opacity-100"
      >
        Categorías{' '}
        <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // `pt-2`: puente transparente para no perder el hover al bajar el mouse.
        <div className="absolute left-0 top-full z-50 pt-2">
          <div className="max-h-[75vh] w-64 overflow-y-auto rounded-lg border border-black/10 bg-bg p-3 text-fg shadow-xl">
            <CategoryTree nodes={tree} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobile: mismo árbol acordeón, inline dentro del panel desplegable. */
export function CategoryMenuMobile({ onNavigate }: { onNavigate: () => void }) {
  const tree = useCategoryTree();
  if (tree.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-0 py-1.5 text-xs font-bold uppercase tracking-wide opacity-50">Categorías</div>
      <CategoryTree nodes={tree} onNavigate={onNavigate} />
    </div>
  );
}
