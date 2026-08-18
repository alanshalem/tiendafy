import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
 * Tooltip liviano por hover/focus. La burbuja va por portal con position:fixed,
 * así escapa de contenedores con overflow (el caso típico: el sidebar con
 * scroll, que recortaría cualquier absolute interno).
 */
export function Tooltip({ label, side = 'right', delayMs = 350, className, children }: TooltipProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!label) return <>{children}</>;

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos(
        side === 'right'
          ? { x: r.right + 8, y: r.top + r.height / 2 }
          : side === 'top'
            ? { x: r.left + r.width / 2, y: r.top - 8 }
            : { x: r.left + r.width / 2, y: r.bottom + 8 },
      );
    }, delayMs);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  const transform =
    side === 'right' ? 'translateY(-50%)' : side === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)';

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
            className="pointer-events-none z-[70] max-w-64 rounded-md bg-fg px-2.5 py-1.5 text-xs leading-snug text-bg shadow-lg"
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}
