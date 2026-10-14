'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { cn } from '@tiendafy/ui';
import { categoryHref } from '@/lib/category-url';
import { findCategoryNode, useCategoryTree, type CatNode } from '../CategoryMenu';
import { InitialFallback } from '../InitialFallback';
import { usePreviewHref } from '../preview';
import { SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';
import { StoreImage } from '../StoreImage';
import { SectionButton } from './section-button';

/** Forma de la foto de cada categoría. */
export const SHAPE_CLASS = {
  circle: 'aspect-square rounded-full',
  square: 'aspect-square rounded-lg',
  portrait: 'aspect-[3/4] rounded-lg',
} as const;

// Clases enteras (Tailwind no ve las armadas con plantillas).
const MOBILE_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };
const TABLET_COLS: Record<number, string> = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };
const DESKTOP_COLS: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  8: 'lg:grid-cols-8',
};

interface Tile {
  key: string;
  node: CatNode;
  title: string;
  image: string;
}

/** Una categoría: su foto (o la inicial, si no tiene) y su nombre, todo un link. */
export function CategoryTile({
  node,
  title,
  image,
  shape,
  sizes,
}: {
  node: CatNode;
  title: string;
  image: string;
  shape: keyof typeof SHAPE_CLASS;
  sizes: string;
}) {
  const toHref = usePreviewHref();
  return (
    <Link
      href={toHref(categoryHref(node))}
      className="group flex min-w-0 flex-col items-center gap-3 text-center"
    >
      <span
        aria-hidden="true"
        className={cn('relative block w-full overflow-hidden bg-primary/10', SHAPE_CLASS[shape])}
      >
        {image ? (
          <StoreImage
            src={image}
            alt=""
            sizes={sizes}
            className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
          />
        ) : (
          <InitialFallback
            name={title}
            className="flex h-full w-full items-center justify-center text-4xl font-bold text-primary-ink"
          />
        )}
      </span>
      <span className="line-clamp-2 text-sm font-semibold group-hover:underline sm:text-base">{title}</span>
    </Link>
  );
}

/**
 * Categorías principales: las de primer nivel (automático) o las elegidas,
 * cada una con su foto y su nombre (se pueden cambiar), en grilla o carrusel.
 * Las categorías salen del árbol de la tienda que trae el layout.
 */
export function CategoryListSection({ data }: SectionRenderProps<'category-list'>) {
  const preview = usePreviewPlaceholders();
  const tree = useCategoryTree();

  const tiles: Tile[] =
    data.mode === 'auto'
      ? tree.slice(0, data.count).map((node) => ({ key: node.id, node, title: node.name, image: '' }))
      : data.items.flatMap((it, i) => {
          const node = it.categoryId ? findCategoryNode(tree, it.categoryId) : undefined;
          // Una categoría borrada no deja un hueco: se saltea.
          return node
            ? [{ key: `${node.id}-${i}`, node, title: it.title.trim() || node.name, image: it.image }]
            : [];
        });

  if (tiles.length === 0) {
    if (!preview) return null;
    return (
      <section className="mx-auto max-w-container px-4 py-12">
        {data.title && <SectionTitle className="mb-4 text-2xl font-bold">{data.title}</SectionTitle>}
        <p className="rounded-md bg-fg/5 p-4 text-sm text-fg-muted">
          {data.mode === 'auto'
            ? 'Todavía no hay categorías: cargalas en Productos → Categorías.'
            : 'Elegí las categorías que querés mostrar.'}
        </p>
      </section>
    );
  }

  const m = data.columnsMobile;
  const d = data.columnsDesktop;
  const sizes = `(max-width: 768px) ${Math.round(100 / m)}vw, ${Math.round(100 / d)}vw`;
  const tile = (t: Tile) => (
    <CategoryTile node={t.node} title={t.title} image={t.image} shape={data.shape} sizes={sizes} />
  );

  return (
    <section className="mx-auto max-w-container px-4 py-12">
      {data.title && <SectionTitle className="mb-6 text-2xl font-bold">{data.title}</SectionTitle>}
      {data.layout === 'carousel' ? (
        // Se ve un pedazo de la siguiente: así se entiende que se desliza.
        <ul
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:thin]"
          style={{ '--cm': m + 0.35, '--cd': d + 0.35 } as CSSProperties}
          aria-label={data.title || 'Categorías'}
        >
          {tiles.map((t) => (
            <li
              key={t.key}
              className="w-[calc((100%-1rem*(var(--cm)-1))/var(--cm))] shrink-0 snap-start md:w-[calc((100%-1rem*(var(--cd)-1))/var(--cd))]"
            >
              {tile(t)}
            </li>
          ))}
        </ul>
      ) : (
        <ul
          className={cn('grid gap-x-4 gap-y-6', MOBILE_COLS[m], TABLET_COLS[Math.min(d, 4)], DESKTOP_COLS[d])}
        >
          {tiles.map((t) => (
            <li key={t.key}>{tile(t)}</li>
          ))}
        </ul>
      )}
      {data.showAll && (
        <div className="mt-8 text-center">
          <SectionButton text={data.showAllText || 'Ver todas'} link="/productos" variant="outline" />
        </div>
      )}
    </section>
  );
}
