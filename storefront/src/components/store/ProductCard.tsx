'use client';

import Link from 'next/link';
import { createContext, useContext, useState, type MouseEvent } from 'react';
import { formatMoney } from '@tiendafy/types';
import { Icon } from './Icon';
import { ratioClass, type ProductListConfig } from '@/lib/theme';
import { useCart } from './cart';
import { useFavorites } from './favorites';
import { usePreviewHref } from './preview';
import { StoreImage } from './StoreImage';
import { InitialFallback } from './InitialFallback';

// Descuento por transferencia/efectivo del tema (productDetail.cashDiscountPercent).
// Se provee en StorefrontView; las cards lo usan para el "precio con transferencia".
export const CashDiscountContext = createContext(0);

export interface StoreProduct {
  id: string;
  name: string;
  slug: string;
  priceAmount: number;
  currency: string;
  compareAtAmount: number | null;
  image: string | null;
  images: string[];
  variantId: string;
  variantLabel: string;
  stock?: number | null;
}

// Bajo este stock la card muestra "¡Últimas N!" (badge de urgencia).
const LOW_STOCK_THRESHOLD = 5;

export function ProductCard({ product, list }: { product: StoreProduct; list: ProductListConfig }) {
  const { add, setOpen } = useCart();
  const cashPct = useContext(CashDiscountContext);
  const fav = useFavorites();
  const href = usePreviewHref();
  const link = href(`/productos/${product.slug}`);
  const onSale = !!product.compareAtAmount && product.compareAtAmount > product.priceAmount;
  const discountPct = onSale ? Math.round((1 - product.priceAmount / product.compareAtAmount!) * 100) : 0;
  const faved = fav.has(product.id);
  const imgs = product.images?.length ? product.images : product.image ? [product.image] : [];
  const [imgIdx, setImgIdx] = useState(0);
  const stepImg = (e: MouseEvent, dir: number) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIdx((i) => (i + dir + imgs.length) % imgs.length);
  };
  const boxed = list.cardStyle === 'boxed';
  return (
    <div
      className={`group flex h-full flex-col ${
        // "boxed" separa cada producto del fondo: se nota cuando las fotos son
        // recortadas o de fondo blanco y si no se pierden contra la página.
        boxed
          ? 'rounded-lg border border-black/10 bg-bg p-2.5 shadow-sm transition-shadow hover:shadow-md'
          : ''
      }`}
    >
      <Link
        href={link}
        className={`relative block w-full overflow-hidden rounded-lg bg-black/5 ${
          ratioClass[list.imageRatio] ?? ratioClass.square
        }`}
      >
        {/* Badge de descuento: el lever visual de conversión en LATAM. */}
        {onSale && discountPct > 0 && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-red-600 px-1.5 py-0.5 text-[0.7rem] font-bold text-white shadow-sm">
            -{discountPct}%
          </span>
        )}
        {/* Badge de stock (bajo el de %OFF si convive). */}
        {list.showStockBadge && product.stock != null && product.stock <= 0 && (
          <span
            className={`absolute left-2 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.7rem] font-semibold text-white shadow-sm ${onSale && discountPct > 0 ? 'top-9' : 'top-2'}`}
          >
            Sin stock
          </span>
        )}
        {list.showStockBadge &&
          product.stock != null &&
          product.stock > 0 &&
          product.stock <= LOW_STOCK_THRESHOLD && (
            <span
              className={`absolute left-2 z-10 rounded-md bg-amber-500 px-1.5 py-0.5 text-[0.7rem] font-semibold text-white shadow-sm ${onSale && discountPct > 0 ? 'top-9' : 'top-2'}`}
            >
              ¡Últimas {product.stock}!
            </span>
          )}
        {/* Favorito: toggle sin navegar. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fav.toggle(product.id);
          }}
          aria-label={faved ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          aria-pressed={faved}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur transition hover:scale-110"
        >
          <Icon name="heart" className={`h-4 w-4 ${faved ? 'fill-red-500 text-red-500' : 'text-black/55'}`} />
        </button>
        {imgs.length > 0 ? (
          <StoreImage
            src={imgs[imgIdx]}
            alt={product.name}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <InitialFallback
            name={product.name}
            className="flex h-full w-full items-center justify-center text-5xl font-bold text-fg-muted"
          />
        )}
        {/* Carrusel estilo ML: flechas + puntos si hay más de una imagen. */}
        {imgs.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => stepImg(e, -1)}
              aria-label="Imagen anterior"
              className="absolute left-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black/70 shadow-sm transition-opacity hover:bg-white md:opacity-0 md:group-hover:opacity-100"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => stepImg(e, 1)}
              aria-label="Imagen siguiente"
              className="absolute right-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black/70 shadow-sm transition-opacity hover:bg-white md:opacity-0 md:group-hover:opacity-100"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
            <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1">
              {imgs.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${i === imgIdx ? 'bg-white' : 'bg-white/50'}`}
                />
              ))}
            </div>
          </>
        )}
      </Link>
      <Link
        href={link}
        className="mt-2 block min-h-[2.5rem] text-sm font-medium hover:underline [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
      >
        {product.name}
      </Link>
      {list.showPrice && (
        <div className="mt-0.5 text-sm">
          <span className={`font-semibold ${onSale ? 'text-red-600' : ''}`}>
            {formatMoney(product.priceAmount, product.currency)}
          </span>
          {list.showCompareAt && product.compareAtAmount && (
            <span className="ml-2 line-through text-fg-muted">
              {formatMoney(product.compareAtAmount, product.currency)}
            </span>
          )}
        </div>
      )}
      {list.showPrice && list.showCashPrice && cashPct > 0 && (
        <div className="text-xs font-semibold text-green-700">
          {formatMoney(Math.round(product.priceAmount * (1 - cashPct / 100)), product.currency)} con
          transferencia
        </div>
      )}
      {list.showPrice && list.installmentsCount > 0 && (
        <div className="text-xs opacity-70">
          {list.installmentsCount} x{' '}
          {formatMoney(Math.round(product.priceAmount / list.installmentsCount), product.currency)} sin
          interés
        </div>
      )}
      {list.showBuyButton && (
        <button
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
          // Siempre visible. mt-3: gap del precio; el card flex lo mantiene abajo.
          className="mt-3 w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-fg"
        >
          Agregar al carrito
        </button>
      )}
    </div>
  );
}
