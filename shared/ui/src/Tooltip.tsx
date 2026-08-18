import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

export interface TooltipProps {
  /** Texto de la burbuja. Vacío/undefined = sin tooltip (renderiza el hijo solo). */
  label?: ReactNode;
  side?: 'right' | 'top' | 'bottom';
  /** Espera antes de mostrar: evita el parpadeo al cruzar el mouse por una lista. */
  delayMs?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Tooltip liviano por hover/focus: burbuja con flecha hacia el elemento y
 * entrada animada. Va por portal con position:fixed, así escapa de
 * contenedores con overflow (el caso típico: el sidebar con scroll, que
 * recortaría cualquier absolute interno).
 */
export function Tooltip({ label, side = 'right', delayMs = 350, className, children }: TooltipProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);

  // La animación entra un frame después de montar la burbuja.
  useEffect(() => {
    if (!pos) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [pos]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!label) return <>{children}</>;

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos(
        side === 'right'
          ? { x: r.right + 10, y: r.top + r.height / 2 }
          : side === 'top'
            ? { x: r.left + r.width / 2, y: r.top - 10 }
            : { x: r.left + r.width / 2, y: r.bottom + 10 },
      );
    }, delayMs);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setVisible(false);
    setPos(null);
  };

  const transform =
    side === 'right' ? 'translateY(-50%)' : side === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)';
  const enterFrom = side === 'right' ? '-translate-x-1' : side === 'top' ? 'translate-y-1' : '-translate-y-1';
  const arrow =
    side === 'right'
      ? 'left-0 top-1/2 -ml-1 -mt-1'
      : side === 'top'
        ? 'bottom-0 left-1/2 -mb-1 -ml-1'
        : 'top-0 left-1/2 -mt-1 -ml-1';

  return (
    <div
      ref={wrapRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: 'fixed', left: pos.x, top: pos.y, transform }}
            className={cn(
              'pointer-events-none z-[70] max-w-60 rounded-lg bg-fg px-3 py-2 text-xs font-medium leading-snug text-bg shadow-xl ring-1 ring-bg/15',
              'transition-[opacity,translate] duration-150 ease-out',
              visible ? 'opacity-100 translate-x-0 translate-y-0' : `opacity-0 ${enterFrom}`,
            )}
          >
            {label}
            <span aria-hidden="true" className={cn('absolute h-2 w-2 rotate-45 bg-fg', arrow)} />
          </div>,
          document.body,
        )}
    </div>
  );
}
