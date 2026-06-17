'use client';

import { useContext, useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { PreviewContext } from './preview';

/**
 * En el preview del editor, resalta la región al pasar el mouse y muestra
 * "Editar" (y "Eliminar" en secciones); al hacer click avisa al editor
 * (postMessage). Fuera del preview es un passthrough (no agrega DOM).
 */
export function EditableRegion({
  target,
  id,
  label,
  children,
}: {
  target: 'section' | 'footer';
  id?: string;
  label?: string;
  children: ReactNode;
}) {
  const preview = useContext(PreviewContext);
  const [hover, setHover] = useState(false);
  if (!preview) return <>{children}</>;

  const open = () => window.parent?.postMessage({ type: 'tiendafy:edit-section', target, sectionId: id }, '*');
  const del = () => window.parent?.postMessage({ type: 'tiendafy:delete-section', sectionId: id }, '*');
  const canDelete = target === 'section' && Boolean(id);

  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClickCapture={(e) => {
        // El botón de eliminar se maneja solo; no abrir el editor en ese caso.
        const action = (e.target as HTMLElement).closest('[data-region-action]')?.getAttribute('data-region-action');
        if (action === 'delete') return;
        e.preventDefault();
        e.stopPropagation();
        open();
      }}
    >
      {children}
      {hover && (
        <div className="pointer-events-none absolute inset-0 z-40 ring-2 ring-inset ring-[rgb(var(--color-primary))]">
          <div className="pointer-events-auto absolute right-2.5 top-2.5 flex items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-primary-fg shadow-lg"
              style={{ background: 'rgb(var(--color-primary))' }}
            >
              <Pencil className="h-3.5 w-3.5" /> Editar{label ? ` ${label}` : ''}
            </span>
            {canDelete && (
              <button
                type="button"
                data-region-action="delete"
                onClick={(e) => { e.stopPropagation(); del(); }}
                title="Eliminar sección"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-red-600 shadow-lg hover:bg-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
