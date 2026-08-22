'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  Minus,
  Plus,
  Share2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';
import { formatMoney } from '@tiendafy/types';
import { useRouter } from 'next/navigation';
import { useCart } from './cart';
import { useLiveTheme, usePreviewHref } from './preview';
import { InitialFallback } from './InitialFallback';
import { useFocusTrap } from './useFocusTrap';
import type { MoneyDto } from '@tiendafy/types';
import { INPUT_LIGHT_10 } from './styles';

interface Variant {
  id: string;
  sku: string;
  optionValues: string[];
  price: MoneyDto;
  compareAtPrice: MoneyDto | null;
}

interface DetailConfig {
  installmentsCount: number;
  showPaymentLogos: boolean;
  askWhatsApp: boolean;
  showSku: boolean;
  showStock: boolean;
  galleryStyle: 'thumbs' | 'thumbs-left' | 'stacked';
  showRelated: boolean;
  cashDiscountPercent: number;
}

interface ProductOption {
  name: string;
  values: string[];
}

/** Un renglón de la ficha técnica, ya resuelto contra su definición. */
export interface SpecRow {
  name: string;
  value: string;
}

export function ProductDetail({
  name,
  description,
  images,
  options,
  variants,
  specs = [],
  config,
  paymentLogos = [],
  whatsappPhone = '',
}: {
  name: string;
  description: string | null;
  images: { url: string; altText: string | null }[];
  options: ProductOption[];
  variants: Variant[];
  specs?: SpecRow[];
  config: DetailConfig;
  /** Logos del pie: se reusan al lado del botón de comprar. */
  paymentLogos?: string[];
  /** Número del botón flotante de WhatsApp, para consultar por este producto. */
  whatsappPhone?: string;
}) {
  // En preview, el theme live pisa la config del server (refleja cambios al toque).
  const live = useLiveTheme();
  const cfg = live?.productDetail ?? config;
  const logos = live?.footer.paymentLogos ?? paymentLogos;
  const waPhone = (live?.whatsappButton.phone ?? whatsappPhone ?? '').replace(/\D/g, '');
  const router = useRouter();
  const href = usePreviewHref();
  const { add, setOpen } = useCart();
  const hasOptions = options.length > 0;
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  // Selección por opción (color/talle); index-alineado a `options`.
  const [selected, setSelected] = useState<string[]>(variants[0]?.optionValues ?? []);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [shared, setShared] = useState(false);

  const variant =
    (hasOptions
      ? variants.find(
          (v) =>
            v.optionValues.length === selected.length && v.optionValues.every((ov, i) => ov === selected[i]),
        )
      : variants.find((v) => v.id === variantId)) ?? variants[0];
  if (!variant) return null;
  const label = variant.optionValues.length > 0 ? variant.optionValues.join(' / ') : 'Única';

  const cashPct = cfg.cashDiscountPercent ?? 0;
  const cashPrice = cashPct > 0 ? Math.round(variant.price.amount * (1 - cashPct / 100)) : null;

  const addToCart = () =>
    add(
      {
        variantId: variant.id,
        productName: name,
        variantLabel: label,
        priceAmount: variant.price.amount,
        currency: variant.price.currency,
        image: images[0]?.url ?? null,
      },
      qty,
    );

  // Comprar ahora = agregar y saltar directo al checkout (un paso menos que el drawer).
  const buyNow = () => {
    addToCart();
    router.push(href('/checkout'));
  };

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* el usuario canceló el compartir */
    }
  };

  return (
    <div className="mt-4 grid gap-8 md:grid-cols-2">
      <div>
        {cfg.galleryStyle === 'stacked' ? (
          <div className="space-y-3">
            {(images.length > 0 ? images : [null]).map((img, i) =>
              img ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg"
                >
                  <img
                    src={img.url}
                    alt={img.altText ?? name}
                    className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    <ZoomIn className="h-4 w-4" />
                  </span>
                </button>
              ) : (
                <InitialFallback
                  key={i}
                  name={name}
                  className="flex aspect-square items-center justify-center rounded-lg bg-black/5 text-6xl font-bold opacity-30"
                />
              ),
            )}
          </div>
        ) : cfg.galleryStyle === 'thumbs-left' ? (
          <div className="flex gap-3">
            {images.length > 1 && (
              <div className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto pr-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    onMouseEnter={() => setActiveImg(i)}
                    aria-label={`Ver imagen ${i + 1}`}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${i === activeImg ? 'border-primary' : 'border-black/10 hover:border-black/30'}`}
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {images[activeImg] ? (
                <MagnifierImage
                  src={images[activeImg].url}
                  alt={images[activeImg].altText ?? name}
                  onOpen={() => setLightboxIndex(activeImg)}
                />
              ) : (
                <InitialFallback
                  name={name}
                  className="flex aspect-square items-center justify-center rounded-lg bg-black/5 text-6xl font-bold opacity-30"
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {images[activeImg] ? (
              <MagnifierImage
                src={images[activeImg].url}
                alt={images[activeImg].altText ?? name}
                onOpen={() => setLightboxIndex(activeImg)}
              />
            ) : (
              <InitialFallback
                name={name}
                className="flex aspect-square items-center justify-center rounded-lg bg-black/5 text-6xl font-bold opacity-30"
              />
            )}
            {images.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    onMouseEnter={() => setActiveImg(i)}
                    aria-label={`Ver imagen ${i + 1}`}
                    className={`h-16 w-16 overflow-hidden rounded-md border-2 transition-colors ${i === activeImg ? 'border-primary' : 'border-transparent hover:border-black/20'}`}
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          {name}
        </h1>
        {cfg.showStock && <div className="mt-1 text-sm font-medium text-green-600">● En stock</div>}
        {cfg.showSku && <div className="text-xs opacity-50">SKU: {variant.sku}</div>}
        <div className="mt-3 text-2xl font-bold">
          {formatMoney(variant.price.amount, variant.price.currency)}
          {variant.compareAtPrice && (
            <span className="ml-3 text-lg font-normal line-through opacity-50">
              {formatMoney(variant.compareAtPrice.amount, variant.compareAtPrice.currency)}
            </span>
          )}
        </div>
        {cashPrice !== null && (
          <div className="mt-1">
            <span className="text-xl font-bold text-primary">
              {formatMoney(cashPrice, variant.price.currency)}
            </span>
            <span className="ml-1.5 text-sm opacity-70">con EFECTIVO</span>
            <div className="text-xs opacity-60">
              {cashPct}% de descuento pagando con transferencia o efectivo
            </div>
          </div>
        )}

        {cfg.installmentsCount > 0 && (
          <div className="mt-1 text-sm opacity-70">
            {cfg.installmentsCount} cuotas sin interés de{' '}
            <span className="font-semibold">
              {formatMoney(Math.round(variant.price.amount / cfg.installmentsCount), variant.price.currency)}
            </span>
          </div>
        )}

        {description && <p className="mt-4 whitespace-pre-line opacity-75">{description}</p>}

        {/* Ficha técnica: los datos que si no están, se preguntan por WhatsApp. */}
        {specs.length > 0 && (
          <dl className="mt-5 overflow-hidden rounded-lg border border-[rgb(var(--color-fg)/0.12)]">
            {specs.map((row, i) => (
              <div
                key={row.name}
                className={`flex gap-4 px-4 py-2.5 text-sm ${
                  i % 2 === 1 ? 'bg-[rgb(var(--color-fg)/0.04)]' : ''
                }`}
              >
                <dt className="w-40 shrink-0 opacity-60">{row.name}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Selección por opción (color, talle…) como botones */}
        {hasOptions
          ? options.map((opt, oi) => (
              <div key={opt.name} className="mt-5">
                <label className="mb-1.5 block text-sm font-medium">
                  {opt.name}: <span className="font-semibold">{selected[oi]}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {opt.values.map((val) => {
                    const active = selected[oi] === val;
                    return (
                      <button
                        key={val}
                        onClick={() =>
                          setSelected((s) => {
                            const next = [...s];
                            next[oi] = val;
                            return next;
                          })
                        }
                        aria-pressed={active}
                        className={`min-w-11 rounded-md border-2 px-3 py-2 text-sm transition-colors ${active ? 'border-primary font-semibold' : 'border-black/15 hover:border-black/40'}`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          : variants.length > 1 && (
              <div className="mt-5">
                <label className="mb-1.5 block text-sm font-medium">Variante</label>
                <select
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  aria-label="Variante"
                  className={INPUT_LIGHT_10}
                >
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku}
                    </option>
                  ))}
                </select>
              </div>
            )}

        <div className="mt-5 space-y-3">
          {/* Comprar ahora — CTA principal */}
          <button
            onClick={buyNow}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-fg"
          >
            Comprar ahora
          </button>

          {/* Cantidad + Agregar al carrito */}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-md border border-black/15">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Restar"
                className="inline-flex h-11 w-10 items-center justify-center"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center tabular-nums">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                aria-label="Sumar"
                className="inline-flex h-11 w-10 items-center justify-center"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => {
                addToCart();
                setOpen(true);
              }}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-md border-2 border-primary text-sm font-semibold text-primary"
            >
              Agregar al carrito
            </button>
          </div>

          {/* Consultar antes de comprar: en muchos rubros la venta se cierra por
              chat, y sin esto el visitante se iba a buscar el número al pie. */}
          {cfg.askWhatsApp && waPhone && (
            <a
              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`¡Hola! Quería consultar por «${name}».`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-black/15 text-sm font-semibold hover:border-black/40"
            >
              <MessageCircle className="h-4 w-4" /> Consultar por este producto
            </a>
          )}

          {/* Medios de pago donde se decide la compra, no solo al pie. */}
          {cfg.showPaymentLogos && logos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {logos.map((slug) => (
                <img
                  key={slug}
                  src={`/payment-logos/${slug}.svg`}
                  alt=""
                  className="h-6 w-auto rounded bg-white p-0.5 opacity-80"
                />
              ))}
            </div>
          )}

          {/* Compartir */}
          <button
            onClick={share}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-medium opacity-70 hover:opacity-100"
          >
            {shared ? (
              <>
                <Check className="h-4 w-4" /> ¡Link copiado!
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" /> Compartir
              </>
            )}
          </button>

          {/* Compra protegida */}
          <div className="mt-1 flex items-start gap-2.5 rounded-md border border-black/10 bg-black/[0.02] p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 opacity-70" />
            <div>
              <div className="font-semibold">Compra protegida</div>
              <div className="text-xs opacity-60">Tus datos cuidados durante toda la compra.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: barra fija de compra (el CTA no se pierde al scrollear). */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-black/10 bg-bg px-4 py-2.5 text-fg shadow-[0_-4px_14px_rgba(0,0,0,0.08)] md:hidden">
        <div className="min-w-0">
          <div className="truncate text-xs opacity-60">{name}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">
              {formatMoney(variant.price.amount, variant.price.currency)}
            </span>
            {variant.compareAtPrice && (
              <span className="text-xs line-through opacity-50">
                {formatMoney(variant.compareAtPrice.amount, variant.compareAtPrice.currency)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            addToCart();
            setOpen(true);
          }}
          className="ml-auto inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg"
        >
          Agregar al carrito
        </button>
      </div>
      {/* Espaciador para que la barra fija no tape el contenido en mobile. */}
      <div className="h-16 md:hidden" />

      {lightboxIndex !== null && images[lightboxIndex] && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          alt={name}
        />
      )}
    </div>
  );
}

/** Imagen principal estilo MercadoLibre: lens sobre la imagen + panel de zoom al costado (desktop). Click → pantalla completa. */
const ZOOM = 2.6;
function MagnifierImage({ src, alt, onOpen }: { src: string; alt: string; onOpen: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [lens, setLens] = useState({ x: 0, y: 0 });

  const move = (e: MouseEvent<HTMLDivElement>) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const lensW = r.width / ZOOM;
    const lensH = r.height / ZOOM;
    let x = e.clientX - r.left - lensW / 2;
    let y = e.clientY - r.top - lensH / 2;
    x = Math.max(0, Math.min(x, r.width - lensW));
    y = Math.max(0, Math.min(y, r.height - lensH));
    setBox({ w: r.width, h: r.height });
    setLens({ x, y });
  };

  const lensW = box.w / ZOOM;
  const lensH = box.h / ZOOM;

  return (
    <div className="relative">
      <div
        ref={boxRef}
        className="group relative aspect-square w-full cursor-crosshair overflow-hidden rounded-lg border border-black/5"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onMouseMove={move}
        onClick={onOpen}
      >
        <img src={src} alt={alt} draggable={false} className="h-full w-full select-none object-cover" />
        {show && box.w > 0 && (
          <div
            className="pointer-events-none absolute hidden border border-white bg-white/25 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] md:block"
            style={{ left: lens.x, top: lens.y, width: lensW, height: lensH }}
          />
        )}
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-4 w-4" />
        </span>
      </div>

      {/* Panel de zoom al costado (solo desktop) */}
      {show && box.w > 0 && (
        <div
          className="pointer-events-none absolute left-[calc(100%+1.25rem)] top-0 z-50 hidden overflow-hidden rounded-lg border border-black/10 bg-white shadow-2xl md:block"
          style={{
            width: box.w,
            height: box.h,
            backgroundImage: `url(${src})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${box.w * ZOOM}px ${box.h * ZOOM}px`,
            backgroundPosition: `-${lens.x * ZOOM}px -${lens.y * ZOOM}px`,
          }}
        />
      )}
    </div>
  );
}

/** Visor a pantalla completa: prev/next, miniaturas, teclado (←/→/Esc), y click-to-zoom con pan. */
function Lightbox({
  images,
  index,
  alt,
  onChange,
  onClose,
}: {
  images: { url: string; altText: string | null }[];
  index: number;
  alt: string;
  onChange: (i: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onChange((index + 1) % images.length);
      else if (e.key === 'ArrowLeft') onChange((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, onChange, onClose]);

  const img = images[index];
  const go = (d: number) => {
    setZoomed(false);
    onChange((index + d + images.length) % images.length);
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 outline-none backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <div className="flex items-center justify-between px-5 py-4 text-white/80">
        <span className="text-sm tabular-nums">
          {index + 1} / {images.length}
        </span>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-full p-1.5 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 && (
          <button
            onClick={() => go(-1)}
            aria-label="Anterior"
            className="absolute left-3 z-10 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}
        <img
          key={img.url}
          src={img.url}
          alt={img.altText ?? alt}
          draggable={false}
          onClick={() => setZoomed((z) => !z)}
          onMouseMove={(e) => {
            if (!zoomed) return;
            const r = e.currentTarget.getBoundingClientRect();
            setOrigin(
              `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`,
            );
          }}
          className={`max-h-[80vh] max-w-[92vw] select-none object-contain transition-transform duration-200 ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
          style={{ transformOrigin: origin, transform: zoomed ? 'scale(2.4)' : 'scale(1)' }}
        />
        {images.length > 1 && (
          <button
            onClick={() => go(1)}
            aria-label="Siguiente"
            className="absolute right-3 z-10 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>

      {images.length > 1 && (
        <div
          className="flex justify-center gap-2 overflow-x-auto px-4 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((im, i) => (
            <button
              key={i}
              onClick={() => {
                setZoomed(false);
                onChange(i);
              }}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition ${i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-100'}`}
            >
              <img src={im.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
