import { useCallback, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { cn } from '@tiendafy/ui';
import type { Device } from './EditorTopBar';

/*
 * La vista previa con el ancho del dispositivo elegido.
 *
 * Antes el iframe tomaba el ancho que le quedaba al lado del panel: en una
 * tablet (o una notebook chica) eran 450–650 px, así que "Computadoras" y
 * "Tablets" mostraban el diseño de celular y no había forma de ver cómo
 * quedaba la tienda en una pantalla grande. Ahora el iframe se dibuja al
 * ancho real del dispositivo (390 / 834 / 1280 o más) y se achica con CSS
 * para que entre, como hace Shopify: la tienda ve su ancho de verdad (y sus
 * breakpoints), el comercio ve la página entera en miniatura.
 *
 * En un celular no se emula nada: la vista previa ocupa la pantalla y el
 * propio teléfono ya es la vista de celular.
 */

/** Ancho (en px de CSS) al que se dibuja la tienda en cada dispositivo. */
const DEVICE_VIEWPORT: Record<Device, number> = { mobile: 390, tablet: 834, desktop: 1280 };
const DEVICE_NAME: Record<Device, string> = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computadora' };
/** El marco negro del celular y la tablet (border-8). */
const BEZEL = 8;
/** Aire alrededor de la vista previa (lo que antes era p-6). */
const GAP = 24;

interface PreviewLayout {
  /** Ancho y alto del iframe, en px del dispositivo (antes de achicar). */
  width: number;
  height: number;
  /** Cuánto se achica para entrar (1 = tamaño real). */
  scale: number;
  /** Con marco de dispositivo (celular y tablet). */
  framed: boolean;
}

/**
 * Cómo dibujar la vista previa en un espacio de `area` px. La computadora usa
 * todo el ancho si hay más de 1280; si no, se dibuja a 1280 y se achica.
 * El alto siempre llena el espacio: se scrollea adentro del iframe.
 */
export function previewLayout(device: Device, area: { width: number; height: number }): PreviewLayout | null {
  const availW = area.width - GAP * 2;
  const availH = area.height - GAP * 2;
  if (availW <= 0 || availH <= 0) return null;
  const framed = device !== 'desktop';
  const bezel = framed ? BEZEL * 2 : 0;
  const width = device === 'desktop' ? Math.max(availW, DEVICE_VIEWPORT.desktop) : DEVICE_VIEWPORT[device];
  const scale = Math.min(1, availW / (width + bezel));
  return { width, height: Math.round(availH / scale - bezel), scale, framed };
}

const MD = '(min-width: 768px)';
const subscribeMd = (cb: () => void) => {
  const mq = window.matchMedia(MD);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
};
/** ¿Pantalla de md para arriba? (en un celular no se emula el dispositivo). */
const useIsWide = () =>
  useSyncExternalStore(
    subscribeMd,
    () => window.matchMedia(MD).matches,
    () => true,
  );

/** Tamaño de un elemento, siguiéndolo con un ResizeObserver (null hasta medirlo). */
function useElementSize<T extends HTMLElement>(): [Ref<T>, { width: number; height: number } | null] {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * El contenedor de la vista previa. `children` es el iframe (o el "Cargando"):
 * siempre en el mismo lugar del árbol, así cambiar de dispositivo solo cambia
 * estilos y el iframe no se vuelve a cargar.
 */
export function PreviewFrame({
  device,
  hidden,
  children,
}: {
  device: Device;
  /** En celular, mientras está la pestaña "Editar". */
  hidden: boolean;
  children: ReactNode;
}) {
  const wide = useIsWide();
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  const layout = wide && area ? previewLayout(device, area) : null;
  const bezel = layout?.framed ? BEZEL * 2 : 0;
  const outerW = layout ? (layout.width + bezel) * layout.scale : 0;
  const outerH = layout ? (layout.height + bezel) * layout.scale : 0;

  return (
    <div
      ref={areaRef}
      data-testid="preview-area"
      className={cn(
        'relative min-w-0 flex-1 overflow-hidden bg-bg-muted',
        hidden ? 'hidden md:block' : 'block',
      )}
    >
      {layout && (
        <p
          className="pointer-events-none absolute inset-x-0 top-1 text-center text-2xs font-medium text-fg-muted"
          aria-live="polite"
        >
          {DEVICE_NAME[device]} · {Math.round(layout.width)} px
          {layout.scale < 1 && ` · al ${Math.round(layout.scale * 100)}%`}
        </p>
      )}
      <div
        data-testid="preview-scaler"
        className={cn(!layout && 'h-full w-full')}
        style={
          layout
            ? { width: outerW, height: outerH, margin: `${GAP}px auto 0`, position: 'relative' }
            : undefined
        }
      >
        <div
          className={cn(
            'h-full w-full overflow-hidden bg-white',
            layout?.framed && 'rounded-[2rem] border-8 border-black bg-black shadow-2xl',
            // ring y no border: el borde le comería 2 px al ancho de la tienda.
            layout && !layout.framed && 'rounded-lg shadow-card ring-1 ring-border',
          )}
          style={
            layout
              ? {
                  width: layout.width + bezel,
                  height: layout.height + bezel,
                  transform: layout.scale < 1 ? `scale(${layout.scale})` : undefined,
                  transformOrigin: 'top left',
                }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
