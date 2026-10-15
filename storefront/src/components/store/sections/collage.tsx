'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatMoney, safeHref, type CollageBlock } from '@tiendafy/types';
import { cn } from '@tiendafy/ui/cn';
import { categoryHref } from '@/lib/category-url';
import { findCategoryNode, useCategoryTree } from '../CategoryMenu';
import type { StoreProduct } from '../ProductCard';
import { usePreviewHref } from '../preview';
import { ImagePlaceholder, SectionTitle } from '../section-primitives';
import { useSectionProducts } from '../SectionProductsContext';
import type { SectionRenderProps } from '../section-types';
import { StoreImage } from '../StoreImage';
import { StoreLink } from '../StoreLink';

/** Lo que muestra un bloque, ya resuelto (producto o categoría encontrados). */
interface Tile {
  image: string;
  title: string;
  /** Precio, solo en los de producto. */
  detail?: string;
  href: string | null;
  internal: boolean;
  /** Solo en el editor: el bloque está a medio elegir y esto dice qué falta. */
  missing?: string;
}

function TileBody({ tile, big, placeholder }: { tile: Tile; big: boolean; placeholder: boolean }) {
  return (
    <>
      {tile.image ? (
        <StoreImage
          src={tile.image}
          alt=""
          sizes={big ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 100vw, 25vw'}
          className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
        />
      ) : placeholder ? (
        <ImagePlaceholder label={tile.missing ?? 'Subí una imagen'} chip={tile.title ? 'top' : undefined} />
      ) : (
        <span className="absolute inset-0 bg-primary/15" />
      )}
      {(tile.title || tile.detail) && (
        <span
          className={cn(
            'absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4 text-left',
            tile.image ? 'bg-gradient-to-t from-black/70 to-transparent pt-12 text-white' : 'text-fg',
          )}
        >
          {tile.title && (
            <span className={cn('font-bold leading-tight', big ? 'text-2xl' : 'text-lg')}>{tile.title}</span>
          )}
          {tile.detail && <span className="text-sm font-semibold opacity-90">{tile.detail}</span>}
        </span>
      )}
    </>
  );
}

function TileLink({ tile, className, children }: { tile: Tile; className: string; children: ReactNode }) {
  const toHref = usePreviewHref();
  if (!tile.href) return <div className={className}>{children}</div>;
  if (tile.internal)
    return (
      <Link href={toHref(tile.href)} className={className}>
        {children}
      </Link>
    );
  return (
    <StoreLink href={tile.href} className={className}>
      {children}
    </StoreLink>
  );
}

/**
 * Collage: dos o tres bloques —una imagen con link, un producto o una
 * categoría— con el primero grande a un lado y los demás apilados al otro.
 * En celular van uno debajo del otro o deslizando.
 */
export function CollageSection({ section, data, products, preview }: SectionRenderProps<'collage'>) {
  const resolved = useSectionProducts(section.id);
  const tree = useCategoryTree();

  const productById = (id: string): StoreProduct | undefined =>
    (resolved ?? products).find((p) => p.id === id);

  // En el editor, un bloque de producto o categoría todavía sin elegir se
  // ve con su lugar y qué falta: antes desaparecía, y el bloque que quedaba
  // pasaba a ser "el grande" ocupando media fila sin explicación.
  const pending = (missing: string, title: string): Tile | null =>
    preview ? { image: '', title, href: null, internal: false, missing } : null;

  const toTile = (b: CollageBlock): Tile | null => {
    if (b.kind === 'product') {
      const p = b.productId ? productById(b.productId) : undefined;
      if (!p) return pending('Elegí un producto', b.title.trim());
      return {
        image: b.image || p.image || p.images[0] || '',
        title: b.title.trim() || p.name,
        detail: formatMoney(p.priceAmount, p.currency),
        href: `/productos/${p.slug}`,
        internal: true,
      };
    }
    if (b.kind === 'category') {
      const node = b.categoryId ? findCategoryNode(tree, b.categoryId) : undefined;
      if (!node) return pending('Elegí una categoría', b.title.trim());
      return { image: b.image, title: b.title.trim() || node.name, href: categoryHref(node), internal: true };
    }
    if (!b.image && !b.title.trim()) return null;
    return { image: b.image, title: b.title.trim(), href: safeHref(b.link) ?? null, internal: false };
  };

  const tiles = data.blocks
    .map(toTile)
    .filter((t): t is Tile => t !== null)
    .slice(0, 3);
  if (tiles.length === 0) {
    if (!preview) return null;
    return (
      <section className="mx-auto max-w-container px-4 py-12">
        <p className="rounded-md bg-fg/5 p-4 text-sm text-fg-muted">
          Elegí qué va en cada bloque: una imagen, un producto o una categoría.
        </p>
      </section>
    );
  }

  const right = data.layout === 'big-right';
  const swipe = data.mobile === 'swipe' && tiles.length > 1;
  const three = tiles.length === 3;
  // Uno solo (los otros sin foto ni texto, o un producto que se despublicó):
  // ocupa el ancho entero en vez de dejar media fila vacía.
  const single = tiles.length === 1;

  return (
    <section className="mx-auto max-w-container px-4 py-12">
      {data.title && (
        <SectionTitle align={section.style?.align} className="mb-6 text-2xl font-bold">
          {data.title}
        </SectionTitle>
      )}
      <ul
        className={cn(
          swipe
            ? '-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2'
            : 'grid grid-cols-1 gap-4',
          'md:mx-0 md:grid md:h-[clamp(24rem,42vw,34rem)] md:grid-cols-2 md:grid-rows-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0',
        )}
      >
        {tiles.map((tile, i) => {
          const big = i === 0;
          return (
            <li
              key={i}
              className={cn(
                swipe && 'w-[85%] shrink-0 snap-start md:w-auto',
                // El grande ocupa las dos filas de su lado; con dos bloques, los dos.
                (big || !three) && 'md:row-span-2',
                single && 'md:col-span-2',
                big && right && 'md:col-start-2 md:row-start-1',
                !big && right && 'md:col-start-1',
              )}
            >
              <TileLink
                tile={tile}
                className={cn(
                  'group relative block w-full overflow-hidden rounded-lg md:aspect-auto md:h-full',
                  big && !single ? 'aspect-[4/3]' : 'aspect-[16/9]',
                )}
              >
                <TileBody tile={tile} big={big} placeholder={preview} />
              </TileLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
