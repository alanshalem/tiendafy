import type { ThemeConfig } from '@tiendafy/types';

/*
 * Miniaturas del encabezado y del pie para los selectores del editor: elegir
 * "Logo izquierda · menú centro" en un desplegable obligaba a imaginárselo.
 * SVG con los colores del panel (relativos al texto), así se ven en claro y
 * en oscuro, como las miniaturas de las secciones del inicio.
 */

type Header = ThemeConfig['header'];

const W = 96;

/** Un renglón (logo, ítem del menú, texto). */
function Bar({
  x,
  y,
  w,
  h = 2.5,
  className,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  className: string;
}) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} className={className} />;
}

/** Tres ítems de menú desde `x`. */
function Menu({ x, y, tone }: { x: number; y: number; tone: string }) {
  return (
    <>
      <Bar x={x} y={y} w={8} h={2} className={tone} />
      <Bar x={x + 11} y={y} w={8} h={2} className={tone} />
      <Bar x={x + 22} y={y} w={8} h={2} className={tone} />
    </>
  );
}

/** Íconos de la derecha (cuenta, favoritos, carrito): tres puntos. */
function Icons({ x, y, tone }: { x: number; y: number; tone: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={1.6} className={tone} />
      <circle cx={x + 5} cy={y} r={1.6} className={tone} />
      <circle cx={x + 10} cy={y} r={1.6} className={tone} />
    </>
  );
}

/**
 * Un encabezado en miniatura: la disposición, el tamaño del logo, el borde y
 * si va transparente sobre una foto.
 */
export function HeaderThumb({
  layout,
  logoSize = 'md',
  border = 'none',
  transparent = false,
}: {
  layout: Header['layout'];
  logoSize?: Header['logoSize'];
  border?: Header['border'];
  transparent?: boolean;
}) {
  const H = 40;
  const tall = layout === 'logo-center';
  const bar = tall ? 20 : 13;
  const logoW = logoSize === 'lg' ? 18 : logoSize === 'sm' ? 9 : 13;
  const logoH = logoSize === 'lg' ? 4 : logoSize === 'sm' ? 2.5 : 3;
  const ink = transparent ? 'fill-white/90' : 'fill-surface';
  const soft = transparent ? 'fill-white/70' : 'fill-surface/70';
  const mid = bar / 2;
  let content;
  switch (layout) {
    case 'logo-center':
      content = (
        <>
          <Bar x={6} y={5} w={14} h={2.5} className={soft} />
          <Bar x={W / 2 - logoW / 2} y={6.5 - logoH / 2} w={logoW} h={logoH} className={ink} />
          <Icons x={76} y={6.5} tone={soft} />
          <Menu x={W / 2 - 15} y={14} tone={soft} />
        </>
      );
      break;
    case 'menu-left':
      content = (
        <>
          <Bar x={6} y={mid - logoH / 2} w={logoW} h={logoH} className={ink} />
          <Menu x={6 + logoW + 6} y={mid - 1} tone={soft} />
          <Icons x={76} y={mid} tone={soft} />
        </>
      );
      break;
    case 'menu-right':
      content = (
        <>
          <Bar x={6} y={mid - logoH / 2} w={logoW} h={logoH} className={ink} />
          <Menu x={38} y={mid - 1} tone={soft} />
          <Icons x={76} y={mid} tone={soft} />
        </>
      );
      break;
    default:
      content = (
        <>
          <Bar x={6} y={mid - logoH / 2} w={logoW} h={logoH} className={ink} />
          <Menu x={W / 2 - 15} y={mid - 1} tone={soft} />
          <Icons x={76} y={mid} tone={soft} />
        </>
      );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      {transparent ? (
        <>
          {/* La foto de portada, con el encabezado encima. */}
          <rect width={W} height={H} className="fill-[#5d6878]" />
          <path d={`M0 ${H} L30 22 L48 34 L66 18 L96 ${H} Z`} className="fill-[#47505c]" />
        </>
      ) : (
        <>
          <rect width={W} height={H} className="fill-fg/[0.05]" />
          {border === 'shadow' && <rect y={bar} width={W} height={3} className="fill-fg/15" />}
          <rect width={W} height={bar} className="fill-fg/75" />
          {border === 'line' && <rect y={bar} width={W} height={0.8} className="fill-primary" />}
          <Bar x={18} y={bar + 8} w={60} h={3} className="fill-fg/20" />
          <Bar x={28} y={bar + 14} w={40} h={2.5} className="fill-fg/15" />
        </>
      )}
      {content}
    </svg>
  );
}

/**
 * La barra de anuncio en miniatura, arriba del encabezado: los textos fijos
 * uno al lado del otro, una fila que se va por los costados (en movimiento) o
 * uno solo con sus flechas y los puntitos de cuál es (uno por vez).
 */
export function AnnouncementThumb({ mode }: { mode: ThemeConfig['announcement']['animation'] }) {
  const H = 40;
  const ink = 'fill-surface/90';
  let content;
  switch (mode) {
    case 'marquee':
      content = (
        <>
          {/* Los textos siguen más allá de los bordes: se están moviendo. */}
          {[-10, 22, 54, 86].map((x) => (
            <Bar key={x} x={x} y={4.5} w={22} h={2.5} className={ink} />
          ))}
          <path d="M60 28 h-24 m5 -3.5 l-5 3.5 l5 3.5" className="fill-none stroke-fg/45" strokeWidth={1.4} />
        </>
      );
      break;
    case 'rotate':
      content = (
        <>
          <path
            d="M11 3.5 l-3 2.25 l3 2.25 M85 3.5 l3 2.25 l-3 2.25"
            className="fill-none stroke-surface/80"
          />
          <Bar x={W / 2 - 16} y={4.5} w={32} h={2.5} className={ink} />
          {/* Cuál de los anuncios se ve: uno por vez. */}
          {[-6, 0, 6].map((dx) => (
            <circle
              key={dx}
              cx={W / 2 + dx}
              cy={28}
              r={1.7}
              className={dx === -6 ? 'fill-primary' : 'fill-fg/25'}
            />
          ))}
        </>
      );
      break;
    default:
      content = (
        <>
          <Bar x={14} y={4.5} w={30} h={2.5} className={ink} />
          <circle cx={W / 2} cy={5.75} r={0.9} className="fill-surface/60" />
          <Bar x={52} y={4.5} w={30} h={2.5} className={ink} />
        </>
      );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      <rect width={W} height={H} className="fill-fg/[0.05]" />
      <rect width={W} height={11.5} className="fill-primary" />
      {/* El encabezado, debajo de la barra. */}
      <rect y={11.5} width={W} height={9} className="fill-fg/75" />
      <Bar x={18} y={35} w={60} h={2.5} className="fill-fg/15" />
      {content}
    </svg>
  );
}

/** El pie en miniatura: todo apilado al centro o en columnas. */
export function FooterThumb({
  layout,
  dark = false,
  minimal = false,
}: {
  layout: ThemeConfig['footer']['layout'];
  dark?: boolean;
  /** Solo lo justo (medios de pago y legales). */
  minimal?: boolean;
}) {
  const H = 40;
  const bg = dark ? 'fill-fg/75' : 'fill-fg/[0.05]';
  const ink = dark ? 'fill-surface/80' : 'fill-fg/45';
  const soft = dark ? 'fill-surface/50' : 'fill-fg/20';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      <rect width={W} height={H} className={bg} />
      {layout === 'columns' ? (
        <>
          <Bar x={6} y={7} w={16} h={3.5} className={ink} />
          <Bar x={6} y={14} w={20} h={2} className={soft} />
          <Bar x={6} y={18} w={16} h={2} className={soft} />
          {[34, 54, 74].map((x) => (
            <g key={x}>
              <Bar x={x} y={7} w={12} h={2.5} className={ink} />
              <Bar x={x} y={13} w={14} h={2} className={soft} />
              <Bar x={x} y={17} w={10} h={2} className={soft} />
              <Bar x={x} y={21} w={12} h={2} className={soft} />
            </g>
          ))}
          <rect x={6} y={29} width={84} height={0.6} className={soft} />
          <Bar x={6} y={33} w={22} h={2.5} className={soft} />
          <Bar x={66} y={33} w={24} h={2} className={soft} />
        </>
      ) : minimal ? (
        <>
          <Bar x={W / 2 - 18} y={16} w={36} h={4} className={soft} />
          <Bar x={W / 2 - 20} y={26} w={40} h={2} className={soft} />
        </>
      ) : (
        <>
          <Bar x={W / 2 - 22} y={7} w={44} h={2} className={soft} />
          <Bar x={W / 2 - 14} y={13} w={28} h={2.5} className={ink} />
          <Bar x={W / 2 - 18} y={19} w={36} h={2} className={soft} />
          <Bar x={W / 2 - 16} y={25} w={32} h={4} className={soft} />
          <Bar x={W / 2 - 20} y={33} w={40} h={2} className={soft} />
        </>
      )}
    </svg>
  );
}
