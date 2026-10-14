import type { ReactNode } from 'react';
import type { SectionType } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';

/*
 * Miniaturas de las secciones (menú de agregar y plantillas): un dibujo chico
 * de cómo se ve cada tipo en la tienda. Antes eran bloques grises genéricos:
 * cinco pares de tipos compartían la misma (destacados, nuevos y ofertas eran
 * idénticos; el carrusel igual al hero), en modo oscuro casi no se veían y
 * algunas se salían del recuadro.
 *
 * Son SVG en una grilla de 96 × 64 (3:2) con los colores del panel, así se
 * ven nítidos a cualquier tamaño y en claro y oscuro. El mapa está tipado con
 * SectionType: un tipo nuevo sin miniatura no compila.
 */

const W = 96;
const H = 64;

/** Tonos: siempre relativos al texto del panel, para que sirvan en claro y en oscuro. */
const TONE = {
  image: 'fill-fg/[0.13]',
  glyph: 'fill-fg/25',
  title: 'fill-fg/55',
  body: 'fill-fg/25',
  band: 'fill-fg/[0.06]',
  card: 'fill-surface stroke-fg/15',
  accent: 'fill-primary',
  accentSoft: 'fill-primary/20',
  /**
   * Una foto con texto encima: gris pizarra fijo, igual en claro y en oscuro
   * (relativa al panel, en oscuro se perdía contra el fondo y el texto blanco
   * no se leía).
   */
  photo: 'fill-[#5d6878]',
  /** Texto sobre una foto (blanco, como en la tienda). */
  onImage: 'fill-white/90',
} as const;

/** Un renglón de texto. */
function Line({
  x,
  y,
  w,
  h = 2.5,
  tone = 'body',
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  tone?: keyof typeof TONE;
}) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} className={TONE[tone]} />;
}

/** Un renglón centrado en `cx`. */
const CLine = (p: { cx: number; y: number; w: number; h?: number; tone?: keyof typeof TONE }) => (
  <Line x={p.cx - p.w / 2} y={p.y} w={p.w} h={p.h} tone={p.tone} />
);

/** Un botón de la tienda (color de marca). */
function Button({ x, y, w = 18, h = 5.5 }: { x: number; y: number; w?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} className={TONE.accent} />;
}

/** Una foto: el recuadro con la montañita y el sol, que se lee como "imagen" a cualquier tamaño. */
function Img({
  x,
  y,
  w,
  h,
  r = 2,
  glyph = true,
  photo = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  glyph?: boolean;
  /** Con texto blanco encima: va en el tono fijo de foto (`TONE.photo`). */
  photo?: boolean;
}) {
  const s = Math.min(w, h) * 0.32;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} className={photo ? TONE.photo : TONE.image} />
      {glyph && s >= 4 && (
        <g className={TONE.glyph}>
          <circle cx={cx + s * 0.55} cy={cy - s * 0.45} r={s * 0.22} />
          <path
            d={`M${cx - s} ${cy + s * 0.6} L${cx - s * 0.25} ${cy - s * 0.2} L${cx + s * 0.2} ${cy + s * 0.25} L${cx + s * 0.45} ${cy} L${cx + s} ${cy + s * 0.6} Z`}
          />
        </g>
      )}
    </g>
  );
}

/** Triángulo de "reproducir" centrado en (cx, cy). */
function Play({ cx, cy, r, className }: { cx: number; cy: number; r: number; className: string }) {
  return (
    <path
      d={`M${cx - r * 0.45} ${cy - r * 0.6} L${cx + r * 0.65} ${cy} L${cx - r * 0.45} ${cy + r * 0.6} Z`}
      className={className}
    />
  );
}

/** Una estrella de cinco puntas. */
function Star({ cx, cy, r, className }: { cx: number; cy: number; r: number; className: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  });
  return <polygon points={pts.join(' ')} className={className} />;
}

type ProductBadge = 'star' | 'new' | 'sale';

/** Tres tarjetas de producto con título de sección: destacados, nuevos y ofertas, cada uno con su marca. */
function ProductRow({ badge }: { badge: ProductBadge }) {
  return (
    <>
      <CLine cx={W / 2} y={5} w={34} h={3} tone="title" />
      {[6, 36, 66].map((x) => (
        <g key={x}>
          <Img x={x} y={13} w={24} h={26} />
          {badge === 'star' && <Star cx={x + 5} cy={18} r={3.4} className={TONE.accent} />}
          {badge === 'new' && (
            <g>
              <rect x={x + 2} y={15} width={11} height={5} rx={1.5} className={TONE.accent} />
              <rect x={x + 4} y={17} width={7} height={1.2} rx={0.6} className="fill-primary-fg" />
            </g>
          )}
          {badge === 'sale' && (
            <g>
              <rect x={x + 13} y={15} width={9} height={5} rx={1.5} className="fill-danger" />
              <rect x={x + 15} y={17} width={5} height={1.2} rx={0.6} className="fill-white" />
            </g>
          )}
          <Line x={x} y={43} w={21} />
          {badge === 'sale' ? (
            <g>
              <Line x={x} y={49} w={9} tone="body" />
              <rect x={x - 0.5} y={50} width={10} height={0.7} className="fill-fg/50" />
              <Line x={x + 11} y={49} w={10} tone="accent" />
            </g>
          ) : (
            <Line x={x} y={49} w={12} tone="title" />
          )}
        </g>
      ))}
    </>
  );
}

const THUMBS: Record<SectionType, () => ReactNode> = {
  'hero-video': () => (
    <>
      <Img x={0} y={0} w={W} h={H} r={0} glyph={false} photo />
      <circle cx={W / 2} cy={22} r={7} className="fill-white/90" />
      <Play cx={W / 2 + 0.5} cy={22} r={4.5} className="fill-black/75" />
      <CLine cx={W / 2} y={35} w={44} h={3.5} tone="onImage" />
      <CLine cx={W / 2} y={41.5} w={30} h={2} tone="onImage" />
      <Button x={W / 2 - 10} y={48} w={20} />
    </>
  ),
  carousel: () => (
    <>
      <Img x={6} y={5} w={84} h={44} />
      {[
        { cx: 12, d: 'M13 24.5 l-2.5 2.5 l2.5 2.5' },
        { cx: 84, d: 'M83 24.5 l2.5 2.5 l-2.5 2.5' },
      ].map(({ cx, d }) => (
        <g key={cx}>
          <circle cx={cx} cy={27} r={4} className="fill-surface/90" />
          <path d={d} className="fill-none stroke-fg/60" strokeWidth={1.3} strokeLinecap="round" />
        </g>
      ))}
      <rect x={39} y={54} width={8} height={3} rx={1.5} className={TONE.accent} />
      <circle cx={51.5} cy={55.5} r={1.5} className="fill-fg/25" />
      <circle cx={56.5} cy={55.5} r={1.5} className="fill-fg/25" />
    </>
  ),
  'promo-banners': () => (
    <>
      {[6, 50].map((x) => (
        <g key={x}>
          <Img x={x} y={7} w={40} h={50} glyph={false} photo />
          <Line x={x + 4} y={39} w={24} h={3} tone="onImage" />
          <Line x={x + 4} y={44.5} w={16} h={2} tone="onImage" />
          <Button x={x + 4} y={49} w={14} h={4.5} />
        </g>
      ))}
    </>
  ),
  'category-banners': () => (
    <>
      {[6, 35, 64].map((x) => (
        <g key={x}>
          <Img x={x} y={8} w={26} h={36} />
          <CLine cx={x + 13} y={48} w={16} h={3} tone="title" />
          <CLine cx={x + 13} y={53.5} w={10} h={2} />
        </g>
      ))}
    </>
  ),
  featured: () => <ProductRow badge="star" />,
  'new-products': () => <ProductRow badge="new" />,
  'sale-products': () => <ProductRow badge="sale" />,
  institutional: () => (
    <>
      <rect x={0} y={8} width={W} height={48} className={TONE.band} />
      <circle cx={W / 2} cy={20} r={4} className={TONE.accentSoft} />
      <circle cx={W / 2} cy={20} r={1.6} className={TONE.accent} />
      <CLine cx={W / 2} y={29} w={44} h={3.5} tone="title" />
      <CLine cx={W / 2} y={37} w={70} />
      <CLine cx={W / 2} y={42.5} w={62} />
      <CLine cx={W / 2} y={48} w={40} />
    </>
  ),
  'image-text': () => (
    <>
      <Img x={6} y={7} w={40} h={50} />
      <Line x={52} y={16} w={32} h={3.5} tone="title" />
      <Line x={52} y={25} w={38} />
      <Line x={52} y={30.5} w={34} />
      <Line x={52} y={36} w={26} />
      <Button x={52} y={44} w={20} />
    </>
  ),
  faq: () => (
    <>
      <CLine cx={W / 2} y={5} w={36} h={3} tone="title" />
      <rect x={10} y={13} width={76} height={20} rx={2} className={TONE.card} strokeWidth={0.6} />
      <Line x={14} y={17} w={42} tone="title" />
      <path d="M79 19.5 l2.5 -2 l2.5 2" className="fill-none stroke-fg/60" strokeWidth={1.1} />
      <Line x={14} y={24} w={60} h={2} />
      <Line x={14} y={28.5} w={46} h={2} />
      {[37, 47].map((y) => (
        <g key={y}>
          <rect x={10} y={y} width={76} height={8} rx={2} className={TONE.card} strokeWidth={0.6} />
          <Line x={14} y={y + 2.75} w={36} tone="title" />
          <path d={`M79 ${y + 3} l2.5 2 l2.5 -2`} className="fill-none stroke-fg/60" strokeWidth={1.1} />
        </g>
      ))}
    </>
  ),
  'info-bar': () => (
    <>
      <rect x={0} y={14} width={W} height={36} className={TONE.band} />
      {[17, 48, 79].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={25} r={5.5} className={TONE.accentSoft} />
          {i === 0 && (
            // camión
            <g className={TONE.accent}>
              <rect x={cx - 3.5} y={23} width={4.5} height={3} rx={0.4} />
              <rect x={cx + 1.2} y={24} width={2.3} height={2} rx={0.4} />
              <circle cx={cx - 2} cy={26.8} r={0.9} />
              <circle cx={cx + 2.3} cy={26.8} r={0.9} />
            </g>
          )}
          {i === 1 && (
            // tarjeta
            <g>
              <rect x={cx - 3.5} y={22.5} width={7} height={5} rx={0.8} className={TONE.accent} />
              <rect x={cx - 3.5} y={23.8} width={7} height={1} className="fill-primary-fg/70" />
            </g>
          )}
          {i === 2 && (
            // escudo
            <path
              d={`M${cx} ${21.5} l3.2 1.3 v2.4 c0 2 -1.4 3.3 -3.2 4 c-1.8 -0.7 -3.2 -2 -3.2 -4 v-2.4 Z`}
              className={TONE.accent}
            />
          )}
          <CLine cx={cx} y={35} w={20} tone="title" />
          <CLine cx={cx} y={40.5} w={16} h={2} />
        </g>
      ))}
    </>
  ),
  testimonials: () => (
    <>
      {[5, 35.5, 66].map((x) => (
        <g key={x}>
          <rect x={x} y={7} width={25} height={50} rx={2.5} className={TONE.card} strokeWidth={0.6} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} cx={x + 4.5 + i * 4} cy={13} r={1.7} className="fill-warning" />
          ))}
          <Line x={x + 3} y={19} w={19} h={2} />
          <Line x={x + 3} y={23.5} w={17} h={2} />
          <Line x={x + 3} y={28} w={13} h={2} />
          <circle cx={x + 7} cy={46} r={4} className={TONE.image} />
          <Line x={x + 12.5} y={44.5} w={9} h={2.5} tone="title" />
        </g>
      ))}
    </>
  ),
  brands: () => (
    <>
      <CLine cx={W / 2} y={6} w={36} h={3} tone="title" />
      {[
        [6, 17],
        [37, 17],
        [68, 17],
        [6, 40],
        [37, 40],
        [68, 40],
      ].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width={22} height={17} rx={2} className={TONE.card} strokeWidth={0.6} />
          {i % 3 === 0 && <circle cx={x! + 11} cy={y! + 8.5} r={4.5} className={TONE.glyph} />}
          {i % 3 === 1 && <Line x={x! + 4} y={y! + 7} w={14} h={3.5} tone="glyph" />}
          {i % 3 === 2 && (
            <g className={TONE.glyph}>
              <path d={`M${x! + 5} ${y! + 12} l4 -7 l4 7 Z`} />
              <rect x={x! + 12} y={y! + 7} width={5} height={5} rx={1} />
            </g>
          )}
        </g>
      ))}
    </>
  ),
  newsletter: () => (
    <>
      <rect x={0} y={8} width={W} height={48} className="fill-primary/10" />
      <rect x={W / 2 - 6} y={14} width={12} height={8} rx={1.2} className={TONE.accent} />
      <path d={`M${W / 2 - 6} 14.8 l6 4 l6 -4`} className="fill-none stroke-primary-fg" strokeWidth={0.9} />
      <CLine cx={W / 2} y={26} w={40} h={3.5} tone="title" />
      <CLine cx={W / 2} y={33} w={56} h={2} />
      <rect x={18} y={40} width={40} height={8} rx={2} className={TONE.card} strokeWidth={0.6} />
      <Line x={21} y={43} w={18} h={2} />
      <rect x={60} y={40} width={18} height={8} rx={2} className={TONE.accent} />
    </>
  ),
  instagram: () => (
    <>
      <Img x={30} y={4} w={36} h={56} r={4} glyph={false} photo />
      <rect
        x={34}
        y={8}
        width={8}
        height={8}
        rx={2.4}
        className="fill-none stroke-white/90"
        strokeWidth={1.1}
      />
      <circle cx={38} cy={12} r={1.9} className="fill-none stroke-white/90" strokeWidth={1.1} />
      <circle cx={40.6} cy={9.6} r={0.6} className="fill-white/90" />
      <circle cx={W / 2} cy={32} r={6.5} className="fill-white/90" />
      <Play cx={W / 2 + 0.5} cy={32} r={4} className="fill-black/75" />
      <Line x={34} y={49} w={20} h={2.5} tone="onImage" />
      <Line x={34} y={54} w={14} h={2} tone="onImage" />
    </>
  ),
  'countdown-offer': () => (
    <>
      <CLine cx={W / 2} y={5} w={40} h={3} tone="title" />
      {[0, 1, 2, 3].map((i) => {
        const x = 21 + i * 14;
        return (
          <g key={i}>
            <rect x={x} y={12} width={11} height={11} rx={2} className={TONE.accent} />
            <rect x={x + 2.5} y={16.5} width={6} height={2} rx={1} className="fill-primary-fg" />
            {i < 3 && (
              <g className="fill-fg/50">
                <circle cx={x + 12.5} cy={15.5} r={0.7} />
                <circle cx={x + 12.5} cy={19.5} r={0.7} />
              </g>
            )}
          </g>
        );
      })}
      {[6, 36, 66].map((x) => (
        <g key={x}>
          <Img x={x} y={29} w={24} h={20} />
          <rect x={x + 13} y={31} width={9} height={4.5} rx={1.5} className="fill-danger" />
          <Line x={x} y={52} w={18} h={2} />
          <Line x={x} y={57} w={10} tone="accent" />
        </g>
      ))}
    </>
  ),
  'featured-product': () => (
    <>
      <Img x={6} y={6} w={42} h={52} />
      <Line x={54} y={10} w={34} h={3.5} tone="title" />
      <Line x={54} y={17} w={22} h={2} />
      <Line x={54} y={24} w={16} h={3.5} tone="accent" />
      {[54, 63, 72].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={32}
          width={7}
          height={6}
          rx={1.5}
          className={i === 0 ? 'fill-none stroke-primary' : 'fill-none stroke-fg/30'}
          strokeWidth={0.9}
        />
      ))}
      <rect x={54} y={44} width={34} height={8} rx={2.5} className={TONE.accent} />
      <rect x={63} y={47} width={16} height={2} rx={1} className="fill-primary-fg" />
    </>
  ),
  'promo-popup': () => (
    <>
      <Line x={8} y={8} w={30} h={3} tone="body" />
      <Img x={8} y={16} w={36} h={22} glyph={false} />
      <Img x={52} y={16} w={36} h={22} glyph={false} />
      <rect x={0} y={0} width={W} height={H} className="fill-black/45" />
      <rect x={22} y={10} width={52} height={44} rx={3} className="fill-surface" />
      <path d="M67 14.5 l3 3 M70 14.5 l-3 3" className="stroke-fg/50" strokeWidth={1} />
      <CLine cx={W / 2} y={19} w={30} h={3.5} tone="title" />
      <CLine cx={W / 2} y={26} w={36} h={2} />
      <rect
        x={W / 2 - 14}
        y={32}
        width={28}
        height={8}
        rx={1.5}
        className="fill-primary/10 stroke-primary"
        strokeWidth={0.8}
        strokeDasharray="2 1.5"
      />
      <CLine cx={W / 2} y={35} w={14} h={2} tone="accent" />
      <Button x={W / 2 - 12} y={44} w={24} h={6} />
    </>
  ),
  'rich-text': () => (
    <>
      <Line x={10} y={6} w={46} h={4} tone="title" />
      <Line x={10} y={15} w={76} />
      <Line x={10} y={20.5} w={70} />
      <Line x={10} y={26} w={52} />
      {[33, 38.5].map((y) => (
        <g key={y}>
          <circle cx={12} cy={y + 1.25} r={1.3} className={TONE.title} />
          <Line x={16} y={y} w={y === 33 ? 48 : 38} />
        </g>
      ))}
      <rect x={10} y={46} width={1.8} height={12} rx={0.9} className={TONE.accent} />
      <Line x={15} y={47.5} w={56} h={2.5} tone="title" />
      <Line x={15} y={53} w={40} h={2} />
    </>
  ),
  'category-list': () => (
    <>
      <CLine cx={W / 2} y={7} w={40} h={3} tone="title" />
      {[15, 38, 61, 84].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={31} r={9.5} className={TONE.image} />
          <g className={TONE.glyph}>
            <path d={`M${cx - 5} ${33.5} l3.5 -4 l2.5 2.5 l1.5 -1.5 l3 3 Z`} />
          </g>
          <CLine cx={cx} y={45} w={14} h={2.5} tone="title" />
        </g>
      ))}
    </>
  ),
  video: () => (
    <>
      <Img x={8} y={6} w={80} h={46} r={3} glyph={false} photo />
      <rect x={W / 2 - 9} y={22} width={18} height={13} rx={4} className={TONE.accent} />
      <Play cx={W / 2 + 0.5} cy={28.5} r={4.5} className="fill-primary-fg" />
      <rect x={12} y={46} width={72} height={1.6} rx={0.8} className="fill-white/40" />
      <rect x={12} y={46} width={26} height={1.6} rx={0.8} className={TONE.accent} />
      <CLine cx={W / 2} y={56} w={36} h={2.5} tone="title" />
    </>
  ),
  'icon-columns': () => (
    <>
      {[17, 48, 79].map((cx, i) => (
        <g key={cx}>
          <rect x={cx - 7} y={10} width={14} height={14} rx={4} className={TONE.accentSoft} />
          {i === 0 && <Star cx={cx} cy={17} r={4} className={TONE.accent} />}
          {i === 1 && (
            <path
              d={`M${cx - 3.5} ${17} l2.5 2.5 l4.5 -5`}
              className="fill-none stroke-primary"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {i === 2 && (
            <path
              d={`M${cx} ${21} c-4 -2.6 -5 -4.4 -5 -6 a2.6 2.6 0 0 1 5 -1 a2.6 2.6 0 0 1 5 1 c0 1.6 -1 3.4 -5 6 Z`}
              className={TONE.accent}
            />
          )}
          <CLine cx={cx} y={30} w={20} h={3} tone="title" />
          <CLine cx={cx} y={37} w={24} h={2} />
          <CLine cx={cx} y={41.5} w={20} h={2} />
          <CLine cx={cx} y={46} w={14} h={2} />
        </g>
      ))}
    </>
  ),
  collage: () => (
    <>
      <Img x={6} y={6} w={44} h={52} photo />
      <Line x={10} y={46} w={26} h={3} tone="onImage" />
      <Button x={10} y={51} w={14} h={4} />
      <Img x={54} y={6} w={36} h={24} />
      <Img x={54} y={34} w={36} h={24} />
      <rect x={57} y={51} width={14} height={4.5} rx={1.5} className="fill-surface" />
      <rect x={59} y={52.5} width={10} height={1.5} rx={0.75} className={TONE.title} />
    </>
  ),
};

/** La miniatura de un tipo de sección. El tamaño lo da quien la usa (ocupa todo el ancho, 3:2). */
export function SectionThumb({ type, className }: { type: SectionType; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('block aspect-[3/2] h-auto w-full overflow-hidden rounded-md bg-bg', className)}
      aria-hidden="true"
      focusable="false"
    >
      {THUMBS[type]()}
    </svg>
  );
}

/** El orden de las secciones de una plantilla, de arriba hacia abajo, en miniatura. */
export function TemplateWireframe({ sections }: { sections: readonly SectionType[] }) {
  return (
    <ol className="mt-2 flex gap-1.5" aria-hidden>
      {sections.map((s, i) => (
        <li key={i} className="min-w-0 max-w-16 flex-1">
          <SectionThumb type={s} className="rounded-[3px] border border-border" />
        </li>
      ))}
    </ol>
  );
}
