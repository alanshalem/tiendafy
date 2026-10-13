import { cn } from '@tiendafy/ui';

/*
 * Esqueletos de carga del panel: la forma de lo que viene, en vez de un
 * "Cargando…" suelto en el medio de la pantalla. Cada uno se anuncia como
 * "Cargando…" (o lo que se le pase) a los lectores de pantalla.
 */

/** Un bloque gris que late. Sin animación si la persona pidió menos movimiento. */
export function Bone({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block animate-pulse rounded bg-bg-muted motion-reduce:animate-none', className)}
    />
  );
}

/** Filas de una tabla o lista mientras llegan. */
export function TableSkeleton({ rows = 6, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Bone className="h-4 w-1/3" />
          <Bone className="h-4 w-1/4" />
          <Bone className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Una pantalla entera mientras llega: título, tarjetas de números y un bloque grande. */
export function ScreenSkeleton({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5">
      <div className="space-y-2">
        <Bone className="h-7 w-56" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-surface p-5">
            <Bone className="h-3 w-24" />
            <Bone className="h-6 w-32" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Bone key={i} className={cn('h-4', i % 2 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

/** Un dato chico dentro de un texto (un número de una tarjeta) mientras llega. */
export function InlineSkeleton({ className, label = 'Cargando…' }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block h-3 w-24 animate-pulse rounded bg-bg-muted align-middle motion-reduce:animate-none',
        className,
      )}
    />
  );
}
