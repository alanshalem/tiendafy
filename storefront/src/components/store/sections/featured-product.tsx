'use client';

import Link from 'next/link';
import { useContext } from 'react';
import { formatMoney } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import { useCart } from '../cart';
import { InitialFallback } from '../InitialFallback';
import type { StoreProduct } from '../ProductCard';
import { usePreviewHref } from '../preview';
import { ImagePlaceholder, SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import { useSectionProducts } from '../SectionProductsContext';
import type { SectionRenderProps } from '../section-types';
import { StoreImage } from '../StoreImage';
import { LeadSectionContext } from '../section-context';

const BUTTON =
  'inline-flex min-h-12 items-center justify-center rounded-md px-6 text-sm font-semibold transition-opacity';

/**
 * Las mismas reglas que la card de producto: agotado no se agrega; con varias
 * variantes se elige en la ficha (agregar la primera era agregar un talle o
 * color que no se pidió); con una sola, se agrega y se abre el carrito.
 */
function BuyButtons({ product, mode, href }: { product: StoreProduct; mode: 'cart' | 'link'; href: string }) {
  const { add, setOpen } = useCart();
  const soldOut = product.stock != null && product.stock <= 0;
  const view = (
    <Link
      href={href}
      className={cn(
        BUTTON,
        mode === 'link' ? 'bg-primary text-primary-fg' : 'border border-current hover:opacity-80',
      )}
    >
      Ver producto
    </Link>
  );
  if (mode === 'link') return view;
  if (soldOut)
    return (
      <>
        <button type="button" disabled className={cn(BUTTON, 'cursor-not-allowed bg-fg/10 text-fg-muted')}>
          Sin stock
        </button>
        {view}
      </>
    );
  if ((product.variantCount ?? 1) > 1)
    return (
      <Link href={href} className={cn(BUTTON, 'bg-primary text-primary-fg hover:opacity-90')}>
        Elegir opciones
      </Link>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => {
          add({
            variantId: product.variantId,
            productName: product.name,
            variantLabel: product.variantLabel,
            priceAmount: product.priceAmount,
            currency: product.currency,
            image: product.image,
          });
          setOpen(true);
        }}
        className={cn(BUTTON, 'bg-primary text-primary-fg hover:opacity-90')}
      >
        Agregar al carrito
      </button>
      {view}
    </>
  );
}

/**
 * Un producto grande: foto a un lado, nombre, precio, resumen y compra. El
 * producto sale del plan de la sección (el elegido, o el más vendido si no se
 * eligió ninguno); si la API no respondió, de la lista general de la portada.
 */
export function FeaturedProductSection({
  section,
  data,
  products,
  productList,
}: SectionRenderProps<'featured-product'>) {
  const preview = usePreviewPlaceholders();
  const lead = useContext(LeadSectionContext);
  const resolved = useSectionProducts(section.id);
  const toHref = usePreviewHref();
  const product = resolved
    ? resolved[0]
    : data.productId
      ? products.find((p) => p.id === data.productId)
      : products[0];

  if (!product) {
    if (!preview) return null;
    return (
      <section className="mx-auto max-w-container px-4 py-12">
        <div className="aspect-[16/7] overflow-hidden rounded-lg">
          <ImagePlaceholder label="Elegí el producto que querés destacar" />
        </div>
      </section>
    );
  }

  const href = toHref(`/productos/${product.slug}`);
  const onSale = !!product.compareAtAmount && product.compareAtAmount > product.priceAmount;
  const off = onSale ? Math.round((1 - product.priceAmount / product.compareAtAmount!) * 100) : 0;
  const image = product.image ?? product.images[0];

  return (
    <section className="mx-auto max-w-container px-4 py-12">
      <div className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className={cn(
            'relative block aspect-square w-full overflow-hidden rounded-lg bg-fg/5',
            data.layout === 'image-right' && 'md:order-2',
          )}
        >
          {image ? (
            <StoreImage
              src={image}
              alt=""
              sizes="(max-width: 768px) 100vw, 50vw"
              lcp={lead}
              className="object-cover"
            />
          ) : (
            <InitialFallback
              name={product.name}
              className="flex h-full w-full items-center justify-center text-7xl font-bold text-fg-muted"
            />
          )}
          {off > 0 && (
            <span className="absolute left-3 top-3 rounded-md bg-red-600 px-2 py-1 text-sm font-bold text-white">
              -{off}%
            </span>
          )}
        </Link>
        <div className="min-w-0">
          {data.badge && (
            <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-ink">
              {data.badge}
            </span>
          )}
          <SectionTitle className="text-2xl font-bold sm:text-3xl">
            <Link href={href} className="hover:underline">
              {product.name}
            </Link>
          </SectionTitle>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={cn('text-2xl font-semibold', onSale && 'text-red-600')}>
              {formatMoney(product.priceAmount, product.currency)}
            </span>
            {onSale && (
              <span className="text-fg-muted line-through">
                {formatMoney(product.compareAtAmount!, product.currency)}
              </span>
            )}
          </div>
          {productList.installmentsCount > 0 && (
            <p className="mt-1 text-sm text-fg-muted">
              {`Hasta ${productList.installmentsCount} x ${formatMoney(Math.round(product.priceAmount / productList.installmentsCount), product.currency)} sin interés`}
            </p>
          )}
          {data.showDescription && product.excerpt && (
            <p className="mt-4 max-w-prose text-fg-muted">{product.excerpt}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <BuyButtons product={product} mode={data.button} href={href} />
          </div>
        </div>
      </div>
    </section>
  );
}
