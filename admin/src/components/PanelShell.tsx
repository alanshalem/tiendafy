import { useEffect, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { PAGE_MAIN } from '../lib/styles';

/**
 * El marco de las pantallas del panel: barra lateral, encabezado y contenido.
 * Lo comparten el panel y Configuración.
 *
 * En celular la barra lateral es un cajón que se abre con el botón de menú:
 * antes quedaba fija, ocupaba 256 de los 390 px de la pantalla y todas las
 * páginas se salían de costado —incluido el escáner, que es justamente para
 * usar en el depósito con el celular—.
 */
export function PanelShell({
  sidebar,
  header,
  children,
}: {
  /** El contenido de la barra lateral (logo, menú, pie). */
  sidebar: ReactNode;
  /** Lo que va en el encabezado, a la derecha del botón de menú. */
  header: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Escape cierra el cajón, como cualquier panel que se superpone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen">
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
        />
      )}
      <aside
        id="panel-menu"
        // Elegir a dónde ir cierra el cajón.
        onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-sidebar shrink-0 flex-col border-r border-border bg-accent text-accent-fg transition-[transform,visibility] duration-200 print:hidden',
          'md:sticky md:top-0 md:z-auto md:translate-x-0 md:bg-accent/80 md:backdrop-blur-xl',
          // Cerrado queda además invisible: si no, el teclado seguiría
          // recorriendo los links de un menú que no se ve.
          open ? 'translate-x-0 shadow-overlay' : 'invisible -translate-x-full md:visible',
        )}
      >
        {sidebar}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-header items-center gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-6 print:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="panel-menu"
            className="-ml-1 rounded-md p-2 text-fg-muted hover:bg-bg-muted hover:text-fg md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {header}
        </header>
        <main className={cn(PAGE_MAIN, 'print:p-0')}>{children}</main>
      </div>
    </div>
  );
}
